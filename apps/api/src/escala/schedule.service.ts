import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  StaffingScope,
  type ScheduleGridQueryInput,
  type AssignmentCreateInput,
  type SchedulePublishInput,
} from "@missas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { EscalaAccessService, type EscalaActor } from "./escala-access.service";
import { resolveAvailability, type AvailabilityRuleInput } from "./resolve-availability";
import type { StaffingRule } from "./resolve-staffing";
import type { PlanOccurrence } from "./suggest-schedule";
import {
  buildScheduleGrid,
  type GridExistingAssignment,
  type GridTeam,
  type ScheduleGridResult,
} from "./schedule-grid";

/**
 * Escala — Montagem da escala (S8, camada de I/O).
 *
 * Endpoints de apoio da tela do coordenador, todos autorizados por
 * `EscalaAccessService.assertCanManageTeam` (coordenador só a **própria** equipe;
 * admin todas; 404 em equipe de outra paróquia). `parishId` sempre do ator.
 *
 *  - `getGrid`          — grade do mês/equipe (delegada ao puro `buildScheduleGrid`)
 *                          + o estado de publicação (V4).
 *  - `createAssignment` — atribuição manual com override consciente (V2) e 409 no
 *                          `unique(occurrence, member)` (V3).
 *  - `deleteAssignment` — remove (rascunho ou publicado).
 *  - `publish`          — carimba `publishedAt`/`republishedAt` da (equipe, mês).
 *
 * A publicação **não** apaga nem trava nada: escala publicada continua editável
 * (V4). Um rascunho novo sobre uma escala publicada (`publishedAt = null`) torna a
 * mudança detectável para a S9 — sem tabela de auditoria.
 */
@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    private prisma: PrismaService,
    private access: EscalaAccessService,
  ) {}

  // ── GET /escala/schedule?month&teamId ─────────────────
  async getGrid(actor: EscalaActor, query: ScheduleGridQueryInput) {
    await this.access.assertCanManageTeam(actor, query.teamId);
    const parishId = actor.parishId;
    const { from, to } = monthRange(query.month);

    const [team, occurrences] = await Promise.all([
      this.prisma.team.findFirst({
        where: { id: query.teamId, parishId },
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
              member: { select: { fullName: true } },
              qualifications: { select: { functionId: true } },
            },
          },
        },
      }),
      this.prisma.massOccurrence.findMany({
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
      }),
    ]);

    if (!team) throw new NotFoundException("Equipe nao encontrada");

    // Mês não materializado → grade vazia (a materialização é passo separado — S2).
    if (occurrences.length === 0) {
      return {
        month: query.month,
        teamId: team.id,
        teamName: team.name,
        publication: { publishedAt: null, published: false, hasUnpublishedChanges: false },
        occurrences: [] as ScheduleGridResult["occurrences"],
      };
    }

    const occurrenceIds = occurrences.map((o) => o.id);
    const memberIds = [...new Set(team.memberships.map((m) => m.memberId))];

    // Atribuições vivas do mês em TODAS as equipes (A4 é global por ocorrência —
    // precisamos ver a contenda cruzada, D5/V3) + disponibilidade dos membros.
    const [existing, entryRows, ruleRows] = await Promise.all([
      this.prisma.assignment.findMany({
        where: {
          parishId,
          occurrenceId: { in: occurrenceIds },
          status: { not: "CANCELLED" },
        },
        select: {
          id: true,
          occurrenceId: true,
          teamId: true,
          functionId: true,
          memberId: true,
          status: true,
          publishedAt: true,
          republishedAt: true,
          overrideReason: true,
          team: { select: { name: true } },
          function: { select: { name: true } },
          member: { select: { fullName: true } },
        },
      }),
      memberIds.length
        ? this.prisma.availabilityEntry.findMany({
            where: { occurrenceId: { in: occurrenceIds }, memberId: { in: memberIds } },
            select: { memberId: true, occurrenceId: true, status: true },
          })
        : Promise.resolve([]),
      memberIds.length
        ? this.prisma.memberAvailabilityRule.findMany({
            where: { memberId: { in: memberIds } },
            select: { memberId: true, weekday: true, time: true, available: true },
          })
        : Promise.resolve([]),
    ]);

    const gridTeam: GridTeam = {
      id: team.id,
      name: team.name,
      functions: team.functions,
      staffing: team.staffing.map(
        (s): StaffingRule => ({ ...s, scope: s.scope as unknown as StaffingScope }),
      ),
      memberships: team.memberships.map((m) => ({
        memberId: m.memberId,
        memberName: m.member.fullName,
        maxAssignmentsPerMonth: m.maxAssignmentsPerMonth,
        qualifiedFunctionIds: m.qualifications.map((q) => q.functionId),
      })),
    };

    // Uma recusa (DECLINED, S9/L4) NÃO ocupa mais a vaga: a excluímos da grade
    // para a **lacuna reabrir** (o coordenador resolve — sem re-escala, D11/J3).
    // Continua no `existing` bruto só para o marcador de publicação abaixo.
    const gridExisting: GridExistingAssignment[] = existing
      .filter((a) => a.status !== "DECLINED")
      .map((a) => ({
        assignmentId: a.id,
        occurrenceId: a.occurrenceId,
        teamId: a.teamId,
        teamName: a.team.name,
        functionId: a.functionId,
        functionName: a.function.name,
        memberId: a.memberId,
        memberName: a.member.fullName,
        status: a.status,
        published: a.publishedAt != null,
        overrideReason: a.overrideReason,
      }));

    const planOccurrences: PlanOccurrence[] = occurrences.map((o) => ({
      id: o.id,
      date: dayKey(o.date),
      weekday: o.date.getUTCDay(),
      time: o.time,
      isSolemnity: o.isSolemnity,
      scheduleId: o.sourceScheduleId,
      exceptionId: o.sourceExceptionId,
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

    const grid = buildScheduleGrid({
      occurrences: planOccurrences,
      team: gridTeam,
      existing: gridExisting,
      entries,
      rulesByMember,
    });

    return {
      month: query.month,
      teamId: team.id,
      teamName: team.name,
      publication: this.publicationState(existing.filter((a) => a.teamId === team.id)),
      occurrences: grid.occurrences,
    };
  }

  // ── POST /escala/assignments ──────────────────────────
  async createAssignment(actor: EscalaActor, input: AssignmentCreateInput) {
    const parishId = actor.parishId;

    // A função identifica a equipe. Autoriza a equipe (404 fora da paróquia).
    const fn = await this.prisma.teamFunction.findUnique({
      where: { id: input.functionId },
      select: { id: true, teamId: true, isActive: true, team: { select: { parishId: true } } },
    });
    if (!fn || fn.team.parishId !== parishId) {
      throw new NotFoundException("Funcao nao encontrada");
    }
    await this.access.assertCanManageTeam(actor, fn.teamId);
    if (!fn.isActive) throw new BadRequestException("Funcao inativa");

    // Ocorrência da paróquia (para weekday/horário da disponibilidade).
    const occurrence = await this.prisma.massOccurrence.findFirst({
      where: { id: input.occurrenceId, parishId },
      select: { id: true, date: true, time: true },
    });
    if (!occurrence) throw new NotFoundException("Ocorrencia nao encontrada");

    // Membro ativo da paróquia.
    const member = await this.prisma.member.findFirst({
      where: { id: input.memberId, parishId },
      select: { id: true, isActive: true },
    });
    if (!member) throw new NotFoundException("Membro nao encontrado");
    if (!member.isActive) throw new BadRequestException("Membro inativo");

    // V3 (A4/D4): já escalado nesta ocorrência (qualquer equipe) → 409 claro.
    const clash = await this.prisma.assignment.findFirst({
      where: {
        occurrenceId: input.occurrenceId,
        memberId: input.memberId,
        status: { not: "CANCELLED" },
      },
      select: { id: true, team: { select: { name: true } } },
    });
    if (clash) {
      throw new ConflictException(
        `Membro ja escalado nesta ocorrencia (${clash.team.name}).`,
      );
    }

    // Elegibilidade "mole" (exige override consciente — V2): qualificação (A2),
    // disponibilidade (A1) e teto por equipe (A3).
    const { from, to } = monthRangeOf(occurrence.date);
    const [membership, entry, rules, teamMonthLoad] = await Promise.all([
      this.prisma.teamMembership.findFirst({
        where: { teamId: fn.teamId, memberId: input.memberId, isActive: true },
        select: {
          maxAssignmentsPerMonth: true,
          qualifications: { where: { functionId: input.functionId }, select: { functionId: true } },
        },
      }),
      this.prisma.availabilityEntry.findFirst({
        where: { occurrenceId: input.occurrenceId, memberId: input.memberId },
        select: { status: true },
      }),
      this.prisma.memberAvailabilityRule.findMany({
        where: { memberId: input.memberId },
        select: { weekday: true, time: true, available: true },
      }),
      this.prisma.assignment.count({
        where: {
          parishId,
          teamId: fn.teamId,
          memberId: input.memberId,
          status: { not: "CANCELLED" },
          occurrence: { date: { gte: from, lte: to } },
        },
      }),
    ]);

    const qualified = (membership?.qualifications.length ?? 0) > 0;
    const availability = resolveAvailability(
      { weekday: occurrence.date.getUTCDay(), time: occurrence.time },
      entry ? { status: entry.status } : null,
      rules,
    );
    const available = availability.status === "AVAILABLE";
    const cap = membership?.maxAssignmentsPerMonth ?? null;
    const atCap = cap != null && teamMonthLoad >= cap;

    const ineligibility: string[] = [];
    if (!qualified) ineligibility.push("nao qualificado");
    if (!available) ineligibility.push("indisponivel");
    if (atCap) ineligibility.push("no teto");

    // V2: só passa sem `overrideReason` se elegível; senão exige a justificativa.
    if (ineligibility.length > 0 && !input.overrideReason) {
      throw new UnprocessableEntityException({
        message: `Membro inelegivel (${ineligibility.join(", ")}). Informe overrideReason para escalar mesmo assim.`,
        reasons: ineligibility,
      });
    }

    const assignedByUserId = actor.kind === "admin" ? actor.userId : null;
    const assignedByMemberId = actor.kind === "member" ? actor.memberId : null;

    try {
      const created = await this.prisma.assignment.create({
        data: {
          parishId,
          occurrenceId: input.occurrenceId,
          teamId: fn.teamId,
          functionId: input.functionId,
          memberId: input.memberId,
          status: "SCHEDULED",
          publishedAt: null, // rascunho — mesmo sobre escala já publicada (V4)
          overrideReason: input.overrideReason ?? null,
          assignedByUserId,
          assignedByMemberId,
        },
        select: { id: true, overrideReason: true, publishedAt: true },
      });
      this.logger.log(
        `assignment created parish=${parishId} team=${fn.teamId} occ=${input.occurrenceId} member=${input.memberId} override=${input.overrideReason ? "yes" : "no"}`,
      );
      return created;
    } catch (err) {
      // Backstop do unique(occurrenceId, memberId) — D4/Regime A (V3).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Membro ja escalado nesta ocorrencia.");
      }
      throw err;
    }
  }

  // ── DELETE /escala/assignments/:id ────────────────────
  async deleteAssignment(actor: EscalaActor, id: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
      select: { id: true, parishId: true, teamId: true },
    });
    // Ownership por paróquia — 404 não vaza existência.
    if (!assignment || assignment.parishId !== actor.parishId) {
      throw new NotFoundException("Atribuicao nao encontrada");
    }
    await this.access.assertCanManageTeam(actor, assignment.teamId);

    // Remove de fato (rascunho ou publicado — V4 permite editar publicado). Hard
    // delete mantém o unique(occurrence, member) livre para uma futura re-alocação.
    await this.prisma.assignment.delete({ where: { id } });
    this.logger.log(`assignment deleted parish=${actor.parishId} id=${id}`);
    return { deleted: true };
  }

  // ── POST /escala/schedule/publish ─────────────────────
  async publish(actor: EscalaActor, input: SchedulePublishInput) {
    await this.access.assertCanManageTeam(actor, input.teamId);
    const parishId = actor.parishId;
    const { from, to } = monthRange(input.month);
    const now = new Date();

    const scope = {
      parishId,
      teamId: input.teamId,
      status: { not: "CANCELLED" as const },
      occurrence: { date: { gte: from, lte: to } },
    };

    // Carimba a publicação: rascunhos ganham publishedAt+republishedAt; já
    // publicados só re-selam (republishedAt) — resetando o "mudou depois de
    // publicado" (V4). Mesmo instante `now` nas duas escritas.
    const [published, resealed] = await this.prisma.$transaction([
      this.prisma.assignment.updateMany({
        where: { ...scope, publishedAt: null },
        data: { publishedAt: now, republishedAt: now },
      }),
      this.prisma.assignment.updateMany({
        where: { ...scope, publishedAt: { not: null } },
        data: { republishedAt: now },
      }),
    ]);

    this.logger.log(
      `publish parish=${parishId} team=${input.teamId} month=${input.month} published=${published.count} resealed=${resealed.count}`,
    );
    return {
      month: input.month,
      teamId: input.teamId,
      published: published.count,
      resealed: resealed.count,
      publishedAt: (published.count > 0 || resealed.count > 0) ? now.toISOString() : null,
    };
  }

  /**
   * Estado de publicação da (equipe, mês) a partir das atribuições da equipe:
   *  - `publishedAt`          — último selo (`max republishedAt`); null = nunca publicada.
   *  - `published`            — há ao menos uma atribuição publicada.
   *  - `hasUnpublishedChanges` — publicada E há mudança pós-publicação: rascunho
   *                              novo por cima (`publishedAt = null`, V4) **ou** uma
   *                              recusa de escala publicada (DECLINED — S9/L4).
   *                              Reusa o marcador da S8 para sinalizar a lacuna.
   */
  private publicationState(
    teamAssignments: {
      publishedAt: Date | null;
      republishedAt: Date | null;
      status: string;
    }[],
  ) {
    let lastSeal: Date | null = null;
    let anyPublished = false;
    let anyDraft = false;
    let anyPublishedDeclined = false;
    for (const a of teamAssignments) {
      if (a.publishedAt != null) {
        anyPublished = true;
        if (a.status === "DECLINED") anyPublishedDeclined = true;
      } else {
        anyDraft = true;
      }
      if (a.republishedAt && (!lastSeal || a.republishedAt > lastSeal)) {
        lastSeal = a.republishedAt;
      }
    }
    return {
      publishedAt: lastSeal ? lastSeal.toISOString() : null,
      published: anyPublished,
      hasUnpublishedChanges: anyPublished && (anyDraft || anyPublishedDeclined),
    };
  }
}

/** Chave de dia civil (YYYY-MM-DD) a partir de uma Date @db.Date (UTC-midnight). */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Intervalo [primeiro, último dia] do mês YYYY-MM, ancorado em UTC-midnight. */
function monthRange(month: string): { from: Date; to: Date } {
  const [year, mon] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(year, mon - 1, 1)), to: new Date(Date.UTC(year, mon, 0)) };
}

/** Intervalo do mês que contém `date` (para o teto por equipe — A3). */
function monthRangeOf(date: Date): { from: Date; to: Date } {
  const year = date.getUTCFullYear();
  const mon = date.getUTCMonth();
  return { from: new Date(Date.UTC(year, mon, 1)), to: new Date(Date.UTC(year, mon + 1, 0)) };
}
