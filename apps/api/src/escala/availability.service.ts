import { Injectable, NotFoundException } from "@nestjs/common";
import { AvailabilityStatus } from "@missas/shared";
import type {
  MemberAvailabilityUpsertInput,
  MemberAvailabilityRulesInput,
} from "@missas/shared";
import { PrismaService } from "../prisma/prisma.service";
import {
  resolveAvailability,
  type AvailabilityRuleInput,
} from "./resolve-availability";

/**
 * Escala — Disponibilidade do membro (S6).
 *
 * Serve o portal do voluntário: lê as ocorrências do mês com a disponibilidade
 * **efetiva** (via `resolveAvailability`), grava desvios explícitos e gere as
 * regras recorrentes (replace-set). Tudo escopado a `member` (do JWT):
 * `memberId`/`parishId` **nunca** vêm do path/body — um membro não enxerga nem
 * edita dado de outro nem de outra paróquia.
 */

interface MemberContext {
  id: string;
  parishId: string;
}

@Injectable()
export class AvailabilityService {
  constructor(private prisma: PrismaService) {}

  /** Perfil mínimo (nome) p/ o cabeçalho do portal. */
  async getProfile(member: MemberContext) {
    const row = await this.prisma.member.findFirst({
      where: { id: member.id, parishId: member.parishId },
      select: { id: true, fullName: true },
    });
    if (!row) throw new NotFoundException("Membro nao encontrado");
    return row;
  }

  /**
   * Ocorrências do mês (YYYY-MM) da paróquia do membro, com a disponibilidade
   * efetiva por ocorrência (status + source). Mês não materializado → lista
   * vazia (estado vazio no front, não erro).
   */
  async getMonthOccurrences(member: MemberContext, month: string) {
    const { from, to } = monthRange(month);

    const [occurrences, entries, rules] = await Promise.all([
      this.prisma.massOccurrence.findMany({
        where: { parishId: member.parishId, date: { gte: from, lte: to } },
        orderBy: [{ date: "asc" }, { time: "asc" }],
        select: {
          id: true,
          date: true,
          time: true,
          title: true,
          isSolemnity: true,
        },
      }),
      this.prisma.availabilityEntry.findMany({
        where: { memberId: member.id },
        select: { occurrenceId: true, status: true },
      }),
      this.loadRules(member.id),
    ]);

    const entryByOccurrence = new Map(
      entries.map((e) => [e.occurrenceId, e]),
    );

    return occurrences.map((occ) => {
      const entry = entryByOccurrence.get(occ.id) ?? null;
      const availability = resolveAvailability(
        { weekday: occ.date.getUTCDay(), time: occ.time },
        entry ? { status: entry.status } : null,
        rules,
      );
      return {
        id: occ.id,
        date: dayKey(occ.date),
        time: occ.time,
        title: occ.title,
        isSolemnity: occ.isSolemnity,
        availability,
      };
    });
  }

  /**
   * Upsert do desvio explícito de uma ocorrência. `CLEAR` **apaga** o entry
   * (volta a valer a regra). A ocorrência precisa ser da paróquia do membro
   * (404 não vaza existência de dado de outra paróquia).
   */
  async upsertAvailability(
    member: MemberContext,
    input: MemberAvailabilityUpsertInput,
  ) {
    const occurrence = await this.prisma.massOccurrence.findFirst({
      where: { id: input.occurrenceId, parishId: member.parishId },
      select: { id: true, date: true, time: true },
    });
    if (!occurrence) throw new NotFoundException("Ocorrencia nao encontrada");

    if (input.status === "CLEAR") {
      await this.prisma.availabilityEntry.deleteMany({
        where: { memberId: member.id, occurrenceId: occurrence.id },
      });
    } else {
      const status =
        input.status === "AVAILABLE"
          ? AvailabilityStatus.AVAILABLE
          : AvailabilityStatus.UNAVAILABLE;
      await this.prisma.availabilityEntry.upsert({
        where: {
          memberId_occurrenceId: {
            memberId: member.id,
            occurrenceId: occurrence.id,
          },
        },
        create: {
          parishId: member.parishId,
          memberId: member.id,
          occurrenceId: occurrence.id,
          status,
        },
        update: { status },
      });
    }

    // Devolve a disponibilidade efetiva resultante (reflete no autosave).
    const entry = await this.prisma.availabilityEntry.findUnique({
      where: {
        memberId_occurrenceId: {
          memberId: member.id,
          occurrenceId: occurrence.id,
        },
      },
      select: { status: true },
    });
    const rules = await this.loadRules(member.id);
    const availability = resolveAvailability(
      { weekday: occurrence.date.getUTCDay(), time: occurrence.time },
      entry ? { status: entry.status } : null,
      rules,
    );
    return { occurrenceId: occurrence.id, availability };
  }

  /** Regras recorrentes do membro. */
  async getRules(member: MemberContext) {
    return this.prisma.memberAvailabilityRule.findMany({
      where: { memberId: member.id },
      orderBy: [{ weekday: "asc" }, { time: "asc" }],
      select: { id: true, weekday: true, time: true, available: true },
    });
  }

  /**
   * Replace-set das regras recorrentes (padrão das qualificações da S3). Não
   * reescreve os desvios explícitos — só muda o pré-preenchimento.
   */
  async replaceRules(
    member: MemberContext,
    input: MemberAvailabilityRulesInput,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.memberAvailabilityRule.deleteMany({
        where: { memberId: member.id },
      });
      if (input.rules.length > 0) {
        await tx.memberAvailabilityRule.createMany({
          data: input.rules.map((rule) => ({
            parishId: member.parishId,
            memberId: member.id,
            weekday: rule.weekday,
            time: rule.time ?? null,
            available: rule.available,
          })),
        });
      }
    });
    return this.getRules(member);
  }

  /** Carrega as regras do membro no formato do resolvedor puro. */
  private async loadRules(
    memberId: string,
  ): Promise<AvailabilityRuleInput[]> {
    const rows = await this.prisma.memberAvailabilityRule.findMany({
      where: { memberId },
      select: { weekday: true, time: true, available: true },
    });
    return rows.map((r) => ({
      weekday: r.weekday,
      time: r.time,
      available: r.available,
    }));
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
