import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { StaffingScope, type ScheduleSuggestInput } from "@missas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { EscalaAccessService, type EscalaActor } from "./escala-access.service";
import type { AvailabilityRuleInput } from "./resolve-availability";
import type { StaffingRule } from "./resolve-staffing";
import {
  planSchedule,
  type Gap,
  type PlanTeam,
  type PlanOccurrence,
  type PlanExistingAssignment,
} from "./suggest-schedule";

/**
 * Escala — Motor de sugestão (S7).
 *
 * Camada de I/O em volta do planner puro (`planSchedule`): autoriza as equipes,
 * rejeita mês não materializado, carrega o estado do mês, chama o algoritmo e
 * **persiste apenas os rascunhos que faltam** (`publishedAt = null`), sem tocar
 * no que já existe (A5). Devolve `{ created, gaps }`.
 *
 * Autorização (D2): admin da paróquia vê qualquer equipe; coordenador só as que
 * coordena. Reusa `EscalaAccessService.assertCanManageTeam` — mesma costura da
 * S5/S6.5. `parishId` sempre do ator (JWT).
 *
 * Determinismo e não-relaxamento das regras (J3/J4) moram no planner puro; aqui
 * não há nenhuma heurística nova.
 */
@Injectable()
export class SuggestionService {
  private readonly logger = new Logger(SuggestionService.name);

  constructor(
    private prisma: PrismaService,
    private access: EscalaAccessService,
  ) {}

  async suggest(
    actor: EscalaActor,
    input: ScheduleSuggestInput,
  ): Promise<{ created: number; gaps: Gap[] }> {
    const parishId = actor.parishId;

    // 1. Resolve e autoriza o conjunto de equipes.
    const teamIds = await this.resolveTeamIds(actor, input.teamIds);
    if (teamIds.length === 0) {
      // Coordenador sem equipes (ou nenhuma equipe ativa) → nada a sugerir.
      return { created: 0, gaps: [] };
    }

    // 2. Ocorrências do mês. Mês não materializado → 400 com mensagem clara.
    const { from, to } = monthRange(input.month);
    const occurrences = await this.prisma.massOccurrence.findMany({
      where: { parishId, date: { gte: from, lte: to } },
      orderBy: [{ date: "asc" }, { time: "asc" }],
      select: {
        id: true,
        date: true,
        time: true,
        isSolemnity: true,
        sourceScheduleId: true,
        sourceExceptionId: true,
      },
    });
    if (occurrences.length === 0) {
      throw new BadRequestException(
        `Mes ${input.month} nao materializado. Abra o mes (materializacao) antes de sugerir a escala.`,
      );
    }
    const occurrenceIds = occurrences.map((o) => o.id);

    // 3. Equipes com funções, demanda e vínculos ativos (com qualificações).
    const teamsRaw = await this.prisma.team.findMany({
      where: { id: { in: teamIds }, parishId },
      select: {
        id: true,
        name: true,
        functions: {
          where: { isActive: true },
          select: { id: true, name: true, sortOrder: true },
        },
        staffing: {
          where: { isActive: true },
          select: {
            functionId: true,
            requiredCount: true,
            scope: true,
            weekday: true,
            massScheduleId: true,
            massExceptionId: true,
            isActive: true,
          },
        },
        memberships: {
          where: { isActive: true, member: { isActive: true } },
          select: {
            memberId: true,
            maxAssignmentsPerMonth: true,
            qualifications: { select: { functionId: true } },
          },
        },
      },
    });

    const teams: PlanTeam[] = teamsRaw.map((t) => ({
      id: t.id,
      name: t.name,
      functions: t.functions,
      // O enum StaffingScope do Prisma é nominalmente distinto do de `shared`
      // (mesmos valores). A ponte com o modelo real acontece aqui (S7), como
      // documentado em resolve-staffing.ts.
      staffing: t.staffing.map(
        (s): StaffingRule => ({
          ...s,
          scope: s.scope as unknown as StaffingScope,
        }),
      ),
      memberships: t.memberships.map((m) => ({
        memberId: m.memberId,
        maxAssignmentsPerMonth: m.maxAssignmentsPerMonth,
        qualifiedFunctionIds: m.qualifications.map((q) => q.functionId),
      })),
    }));

    // 4. Membros em escopo (p/ carregar disponibilidade só do necessário).
    const memberIds = [
      ...new Set(teams.flatMap((t) => t.memberships.map((m) => m.memberId))),
    ];

    // 5. Estado do mês: atribuições vivas (exceto CANCELLED) em TODAS as equipes
    //    (A4 é global por ocorrência), desvios explícitos, regras recorrentes e o
    //    histórico de serviço ANTES do mês (J2 — há quanto tempo cada um serviu).
    const [existing, entryRows, ruleRows, historyRows] = await Promise.all([
      this.prisma.assignment.findMany({
        where: {
          parishId,
          occurrenceId: { in: occurrenceIds },
          status: { not: "CANCELLED" },
        },
        select: {
          occurrenceId: true,
          teamId: true,
          functionId: true,
          memberId: true,
        },
      }),
      memberIds.length
        ? this.prisma.availabilityEntry.findMany({
            where: {
              occurrenceId: { in: occurrenceIds },
              memberId: { in: memberIds },
            },
            select: { memberId: true, occurrenceId: true, status: true },
          })
        : Promise.resolve([]),
      memberIds.length
        ? this.prisma.memberAvailabilityRule.findMany({
            where: { memberId: { in: memberIds } },
            select: { memberId: true, weekday: true, time: true, available: true },
          })
        : Promise.resolve([]),
      // J2: serviços anteriores ao mês, em QUALQUER equipe (a carga total da pessoa
      // é que interessa). Reduzido à data mais recente por membro (lastServedAt).
      memberIds.length
        ? this.prisma.assignment.findMany({
            where: {
              parishId,
              memberId: { in: memberIds },
              status: { not: "CANCELLED" },
              occurrence: { date: { lt: from } },
            },
            select: { memberId: true, occurrence: { select: { date: true } } },
          })
        : Promise.resolve([]),
    ]);

    // 6. Monta os índices do planner.
    const planOccurrences: PlanOccurrence[] = occurrences.map((o) => ({
      id: o.id,
      date: dayKey(o.date),
      weekday: o.date.getUTCDay(),
      time: o.time,
      isSolemnity: o.isSolemnity,
      scheduleId: o.sourceScheduleId,
      exceptionId: o.sourceExceptionId,
    }));

    const planExisting: PlanExistingAssignment[] = existing.map((a) => ({
      occurrenceId: a.occurrenceId,
      teamId: a.teamId,
      functionId: a.functionId,
      memberId: a.memberId,
    }));

    const entries = new Map<string, { status: string }>();
    for (const e of entryRows) {
      entries.set(`${e.memberId}|${e.occurrenceId}`, { status: e.status });
    }

    const rulesByMember = new Map<string, AvailabilityRuleInput[]>();
    for (const r of ruleRows) {
      const list = rulesByMember.get(r.memberId) ?? [];
      list.push({ weekday: r.weekday, time: r.time, available: r.available });
      rulesByMember.set(r.memberId, list);
    }

    // J2: data (YYYY-MM-DD) do último serviço de cada membro antes do mês.
    const lastServedByMember = new Map<string, string>();
    for (const h of historyRows) {
      const date = dayKey(h.occurrence.date);
      const prev = lastServedByMember.get(h.memberId);
      if (!prev || date > prev) lastServedByMember.set(h.memberId, date);
    }

    // 7. Roda o algoritmo puro.
    const { toCreate, gaps } = planSchedule({
      occurrences: planOccurrences,
      teams,
      existing: planExisting,
      entries,
      rulesByMember,
      lastServedByMember,
    });

    // 8. Persiste os rascunhos (publishedAt=null). O planner garante que nenhum
    //    par (ocorrência, membro) colide com o existente nem entre si (A4), então
    //    a unicidade @@unique([occurrenceId, memberId]) nunca é violada.
    if (toCreate.length > 0) {
      const assignedByUserId = actor.kind === "admin" ? actor.userId : null;
      const assignedByMemberId = actor.kind === "member" ? actor.memberId : null;
      await this.prisma.assignment.createMany({
        data: toCreate.map((a) => ({
          parishId,
          occurrenceId: a.occurrenceId,
          teamId: a.teamId,
          functionId: a.functionId,
          memberId: a.memberId,
          status: "SCHEDULED" as const,
          publishedAt: null,
          assignedByUserId,
          assignedByMemberId,
        })),
      });
    }

    this.logger.log(
      `suggest parish=${parishId} month=${input.month} teams=${teamIds.length} created=${toCreate.length} gaps=${gaps.length}`,
    );
    return { created: toCreate.length, gaps };
  }

  /**
   * Resolve as equipes-alvo autorizadas. Com `teamIds`, autoriza **cada uma**
   * (403 em equipe alheia; 404 em equipe de outra paróquia). Sem `teamIds`, usa
   * o conjunto padrão do ator: admin → todas as equipes ativas da paróquia;
   * coordenador → as que coordena (ativo).
   */
  private async resolveTeamIds(
    actor: EscalaActor,
    requested?: string[],
  ): Promise<string[]> {
    if (requested && requested.length > 0) {
      const unique = [...new Set(requested)];
      for (const teamId of unique) {
        await this.access.assertCanManageTeam(actor, teamId);
      }
      return unique;
    }

    if (actor.kind === "admin") {
      this.access.assertCanManageParish(actor);
      const teams = await this.prisma.team.findMany({
        where: { parishId: actor.parishId, isActive: true },
        select: { id: true },
      });
      return teams.map((t) => t.id);
    }

    // Coordenador: só as equipes que coordena de fato (lido do banco — D2).
    const memberships = await this.prisma.teamMembership.findMany({
      where: {
        memberId: actor.memberId,
        isCoordinator: true,
        isActive: true,
        team: { parishId: actor.parishId, isActive: true },
      },
      select: { teamId: true },
    });
    return [...new Set(memberships.map((m) => m.teamId))];
  }
}

/** Chave de dia civil (YYYY-MM-DD) a partir de uma Date @db.Date (UTC-midnight). */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Intervalo [primeiro, último dia] do mês YYYY-MM, ancorado em UTC-midnight. */
function monthRange(month: string): { from: Date; to: Date } {
  const [year, mon] = month.split("-").map(Number);
  const from = new Date(Date.UTC(year, mon - 1, 1));
  const to = new Date(Date.UTC(year, mon, 0)); // dia 0 do mês seguinte = último dia
  return { from, to };
}
