import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { UpdateOccurrenceInput } from "@missas/shared";

/**
 * Escala — Materializacao e gestao de ocorrencias (S2 + S2.1).
 *
 * Transforma o calendario calculado on-the-fly das Intencoes em ocorrencias
 * concretas persistidas (`MassOccurrence`) para um intervalo. A operacao e
 * idempotente e preserva flags manuais (isSolemnity/title — D7).
 *
 * S2.1 — gestao do mes aberto: excluir uma ocorrencia avulsa (com aviso se
 * tem escala/disponibilidade — a exclusao cascateia) e RECONCILIAR o mes com o
 * cadastro atual (adiciona faltantes, remove orfa vazia direto, orfa com dado
 * humano vira conflito para decisao manual — nunca some sozinha).
 *
 * Guardrail D9: NAO altera o worker/dispatch das Intencoes. A regra de
 * determinacao de missas e REPLICADA aqui (exceptions sobrepoem horarios
 * regulares no mesmo horario), nao importada do worker.
 */

// Candidata a ocorrencia derivada do calendario, antes do upsert.
interface OccurrenceCandidate {
  date: Date; // ancorada em UTC-midnight (@db.Date)
  time: string; // "HH:mm"
  title: string | null;
  sourceScheduleId: string | null;
  sourceExceptionId: string | null;
}

// Ocorrencia orfa/valida com contadores de dado humano (S2.1).
export interface ReconcileConflict {
  occurrenceId: string;
  date: string; // YYYY-MM-DD
  time: string;
  title: string | null;
  isSolemnity: boolean;
  hasAssignments: boolean;
  hasAvailability: boolean;
  assignmentCount: number;
  availabilityCount: number;
}

export interface ReconcileResult {
  month: string;
  added: number;
  updated: number;
  removedClean: number;
  conflicts: ReconcileConflict[];
}

export interface OccurrenceAffected {
  assignmentCount: number;
  publishedAssignmentCount: number;
  availabilityCount: number;
}

@Injectable()
export class OccurrenceService {
  private readonly logger = new Logger(OccurrenceService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Materializa as ocorrencias da paroquia no intervalo [from, to] (datas civis
   * YYYY-MM-DD, inclusivas). Idempotente: re-rodar o mesmo intervalo nao cria
   * duplicatas e preserva isSolemnity/title editados a mao.
   */
  async materialize(
    parishId: string,
    from: string,
    to: string,
  ): Promise<{ created: number; updated: number; total: number }> {
    const fromDate = new Date(from + "T00:00:00.000Z");
    const toDate = new Date(to + "T00:00:00.000Z");

    const candidates = await this.buildCandidates(parishId, fromDate, toDate);

    // Ocorrencias ja existentes no intervalo (p/ decidir create vs update e preservar flags).
    const existing = await this.prisma.massOccurrence.findMany({
      where: { parishId, date: { gte: fromDate, lte: toDate } },
    });
    const existingByKey = new Map(
      existing.map((o) => [this.slotKey(o.date, o.time), o]),
    );

    let created = 0;
    let updated = 0;

    // Upsert idempotente (D7): nunca sobrescreve isSolemnity; so preenche title se null.
    await this.prisma.$transaction(async (tx) => {
      for (const c of candidates) {
        const prev = existingByKey.get(this.slotKey(c.date, c.time));
        if (!prev) {
          await tx.massOccurrence.create({ data: this.createData(parishId, c) });
          created++;
        } else {
          await tx.massOccurrence.update({
            where: { id: prev.id },
            data: this.preserveUpdateData(prev, c),
          });
          updated++;
        }
      }
    });

    const total = candidates.length;
    this.logger.log(
      `materialize parish=${parishId} [${from}..${to}] created=${created} updated=${updated} total=${total}`,
    );
    return { created, updated, total };
  }

  /**
   * Reconcilia o mes YYYY-MM com o cadastro de missas ATUAL (S2.1). Recalcula o
   * conjunto esperado (`MassSchedule` ativos + `MassException`), adiciona as
   * faltantes, atualiza a origem das que continuam validas (preservando
   * isSolemnity/title/assignments/disponibilidade) e trata as ORFAS:
   * - orfa VAZIA (sem escala e sem disponibilidade) → remove direto;
   * - orfa COM dado humano → NAO remove; devolve como conflito p/ decisao manual.
   */
  async reconcile(parishId: string, month: string): Promise<ReconcileResult> {
    const { from: fromDate, to: toDate } = monthRange(month);

    const candidates = await this.buildCandidates(parishId, fromDate, toDate);
    const expectedKeys = new Set(
      candidates.map((c) => this.slotKey(c.date, c.time)),
    );

    // Existentes no mes + contadores de dado humano (escala/disponibilidade).
    const existing = await this.prisma.massOccurrence.findMany({
      where: { parishId, date: { gte: fromDate, lte: toDate } },
      select: {
        id: true,
        date: true,
        time: true,
        title: true,
        isSolemnity: true,
        sourceScheduleId: true,
        sourceExceptionId: true,
        _count: { select: { assignments: true, availability: true } },
      },
    });
    const existingByKey = new Map(
      existing.map((o) => [this.slotKey(o.date, o.time), o]),
    );

    let added = 0;
    let updated = 0;
    let removedClean = 0;
    const conflicts: ReconcileConflict[] = [];

    await this.prisma.$transaction(async (tx) => {
      // 1) Adiciona faltantes; atualiza (preservando) as que continuam validas.
      for (const c of candidates) {
        const prev = existingByKey.get(this.slotKey(c.date, c.time));
        if (!prev) {
          await tx.massOccurrence.create({ data: this.createData(parishId, c) });
          added++;
        } else {
          await tx.massOccurrence.update({
            where: { id: prev.id },
            data: this.preserveUpdateData(prev, c),
          });
          updated++;
        }
      }

      // 2) Trata as orfas (existentes cujo slot nao esta mais no cadastro).
      for (const o of existing) {
        if (expectedKeys.has(this.slotKey(o.date, o.time))) continue;

        const hasAssignments = o._count.assignments > 0;
        const hasAvailability = o._count.availability > 0;

        if (!hasAssignments && !hasAvailability) {
          // Orfa VAZIA → seguro remover direto.
          await tx.massOccurrence.delete({ where: { id: o.id } });
          removedClean++;
        } else {
          // Orfa COM dado humano → nunca some sozinha; vira conflito.
          conflicts.push({
            occurrenceId: o.id,
            date: this.dayKey(o.date),
            time: o.time,
            title: o.title,
            isSolemnity: o.isSolemnity,
            hasAssignments,
            hasAvailability,
            assignmentCount: o._count.assignments,
            availabilityCount: o._count.availability,
          });
        }
      }
    });

    this.logger.log(
      `reconcile parish=${parishId} month=${month} added=${added} updated=${updated} removedClean=${removedClean} conflicts=${conflicts.length}`,
    );
    return { month, added, updated, removedClean, conflicts };
  }

  /**
   * Exclui uma ocorrencia avulsa (S2.1). A exclusao CASCATEIA
   * (`onDelete: Cascade` de Assignment/AvailabilityEntry). Por isso:
   * - sem escala e sem disponibilidade → remove direto;
   * - com dado humano e SEM `force` → NAO apaga; devolve o que sera afetado
   *   (`requiresConfirmation: true`) p/ a UI confirmar explicitamente;
   * - com dado humano e `force=true` → apaga (o coordenador confirmou).
   */
  async deleteOccurrence(parishId: string, id: string, force: boolean) {
    const occ = await this.prisma.massOccurrence.findUnique({
      where: { id },
      select: {
        id: true,
        parishId: true,
        date: true,
        time: true,
        title: true,
        isSolemnity: true,
        _count: { select: { assignments: true, availability: true } },
      },
    });
    // 404 em outra paroquia tambem (nao vaza existencia).
    if (!occ || occ.parishId !== parishId) {
      throw new NotFoundException("Ocorrencia nao encontrada");
    }

    const publishedAssignmentCount =
      occ._count.assignments === 0
        ? 0
        : await this.prisma.assignment.count({
            where: { occurrenceId: id, publishedAt: { not: null } },
          });

    const affected: OccurrenceAffected = {
      assignmentCount: occ._count.assignments,
      publishedAssignmentCount,
      availabilityCount: occ._count.availability,
    };
    const occurrence = {
      id: occ.id,
      date: this.dayKey(occ.date),
      time: occ.time,
      title: occ.title,
      isSolemnity: occ.isSolemnity,
    };

    const hasData =
      affected.assignmentCount > 0 || affected.availabilityCount > 0;

    if (hasData && !force) {
      // Passo 1: nao apaga; devolve o preview p/ a UI avisar antes de cascatear.
      return { deleted: false, requiresConfirmation: true, occurrence, affected };
    }

    await this.prisma.massOccurrence.delete({ where: { id } });
    this.logger.log(
      `deleteOccurrence parish=${parishId} occ=${id} force=${force} assignments=${affected.assignmentCount} availability=${affected.availabilityCount}`,
    );
    return { deleted: true, requiresConfirmation: false, occurrence, affected };
  }

  /**
   * Lista as ocorrencias do mes com INDICADORES p/ a tela de gestao (S2.1):
   * tem escala? tem disponibilidade? e solenidade? e `inCadastro` (o slot ainda
   * existe no cadastro atual — `false` = orfa/fantasma candidata a reconciliacao).
   */
  async listForManagement(parishId: string, month: string) {
    const { from: fromDate, to: toDate } = monthRange(month);

    const [candidates, existing] = await Promise.all([
      this.buildCandidates(parishId, fromDate, toDate),
      this.prisma.massOccurrence.findMany({
        where: { parishId, date: { gte: fromDate, lte: toDate } },
        orderBy: [{ date: "asc" }, { time: "asc" }],
        select: {
          id: true,
          date: true,
          time: true,
          title: true,
          isSolemnity: true,
          sourceScheduleId: true,
          sourceExceptionId: true,
          _count: { select: { assignments: true, availability: true } },
        },
      }),
    ]);

    const expectedKeys = new Set(
      candidates.map((c) => this.slotKey(c.date, c.time)),
    );

    return existing.map((o) => ({
      id: o.id,
      date: this.dayKey(o.date),
      time: o.time,
      title: o.title,
      isSolemnity: o.isSolemnity,
      sourceScheduleId: o.sourceScheduleId,
      sourceExceptionId: o.sourceExceptionId,
      hasAssignments: o._count.assignments > 0,
      assignmentCount: o._count.assignments,
      hasAvailability: o._count.availability > 0,
      availabilityCount: o._count.availability,
      inCadastro: expectedKeys.has(this.slotKey(o.date, o.time)),
    }));
  }

  /** Lista ocorrencias do intervalo [from, to] (inclusivo), ordenadas por data/hora. */
  async list(parishId: string, from: string, to: string) {
    const fromDate = new Date(from + "T00:00:00.000Z");
    const toDate = new Date(to + "T00:00:00.000Z");
    return this.prisma.massOccurrence.findMany({
      where: { parishId, date: { gte: fromDate, lte: toDate } },
      orderBy: [{ date: "asc" }, { time: "asc" }],
      select: {
        id: true,
        date: true,
        time: true,
        title: true,
        isSolemnity: true,
        sourceScheduleId: true,
        sourceExceptionId: true,
      },
    });
  }

  /**
   * Eleva/rebaixa solenidade ou ajusta titulo de uma ocorrencia.
   * `title` ausente = intocado; `title: null` = limpa; string = define.
   */
  async update(parishId: string, id: string, data: UpdateOccurrenceInput) {
    const occ = await this.prisma.massOccurrence.findUnique({
      where: { id },
      select: { parishId: true },
    });
    if (!occ) throw new NotFoundException("Ocorrencia nao encontrada");
    if (occ.parishId !== parishId) {
      throw new ForbiddenException("Ocorrencia de outra paroquia");
    }

    return this.prisma.massOccurrence.update({
      where: { id },
      data: {
        ...(data.isSolemnity !== undefined
          ? { isSolemnity: data.isSolemnity }
          : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
      },
    });
  }

  // ── Helpers ────────────────────────────────────────────

  /**
   * Deriva o conjunto ESPERADO de ocorrencias no intervalo a partir do cadastro
   * atual (mesma regra de S2, REPLICADA — D9). Reusado por materialize,
   * reconcile e listForManagement: um so lugar decide "o que deveria existir".
   */
  private async buildCandidates(
    parishId: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<OccurrenceCandidate[]> {
    const [schedules, exceptions] = await Promise.all([
      this.prisma.massSchedule.findMany({
        where: { parishId, isActive: true },
      }),
      this.prisma.massException.findMany({
        where: { parishId, isActive: true, date: { gte: fromDate, lte: toDate } },
      }),
    ]);

    // Indexa excecoes por dia (YYYY-MM-DD, base UTC) p/ montar candidatas dia a dia.
    const exceptionsByDay = new Map<string, typeof exceptions>();
    for (const ex of exceptions) {
      const key = this.dayKey(ex.date);
      const list = exceptionsByDay.get(key) ?? [];
      list.push(ex);
      exceptionsByDay.set(key, list);
    }

    const candidates: OccurrenceCandidate[] = [];
    for (
      let d = new Date(fromDate);
      d <= toDate;
      d = new Date(d.getTime() + 86_400_000)
    ) {
      const weekday = d.getUTCDay(); // 0 = domingo (mesma convencao de MassSchedule)
      const dayKey = this.dayKey(d);

      // Merge por horario: chave = "HH:mm". Excecao vence horario regular no mesmo horario.
      const byTime = new Map<string, OccurrenceCandidate>();

      // 1. Horarios regulares do weekday.
      for (const s of schedules) {
        if (s.weekday !== weekday) continue;
        byTime.set(s.time, {
          date: new Date(dayKey + "T00:00:00.000Z"),
          time: s.time,
          title: null,
          sourceScheduleId: s.id,
          sourceExceptionId: null,
        });
      }

      // 2. Excecoes do dia — sobrepoem o regular no mesmo horario (excecao "vence").
      for (const ex of exceptionsByDay.get(dayKey) ?? []) {
        byTime.set(ex.time, {
          date: new Date(dayKey + "T00:00:00.000Z"),
          time: ex.time,
          title: ex.title ?? null,
          sourceScheduleId: null,
          sourceExceptionId: ex.id,
        });
      }

      candidates.push(...byTime.values());
    }

    return candidates;
  }

  // Dados de criacao de uma nova ocorrencia (isSolemnity comeca false — elevacao manual).
  private createData(parishId: string, c: OccurrenceCandidate) {
    return {
      parishId,
      date: c.date,
      time: c.time,
      title: c.title,
      sourceScheduleId: c.sourceScheduleId,
      sourceExceptionId: c.sourceExceptionId,
    };
  }

  // Update que PRESERVA o dado humano: atualiza so a origem e preenche title se null.
  // NUNCA mexe em isSolemnity/assignments/disponibilidade (D7).
  private preserveUpdateData(
    prev: { title: string | null },
    c: OccurrenceCandidate,
  ) {
    return {
      sourceScheduleId: c.sourceScheduleId,
      sourceExceptionId: c.sourceExceptionId,
      ...(prev.title == null && c.title != null ? { title: c.title } : {}),
    };
  }

  // Chave de dia civil (YYYY-MM-DD) a partir de uma Date @db.Date (UTC-midnight).
  private dayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  // Chave do slot unico (parishId ja fixado no escopo): dia + horario.
  private slotKey(date: Date, time: string): string {
    return `${this.dayKey(date)}|${time}`;
  }
}

/** Intervalo [primeiro, último dia] do mês YYYY-MM, ancorado em UTC-midnight. */
function monthRange(month: string): { from: Date; to: Date } {
  const [year, mon] = month.split("-").map(Number);
  return {
    from: new Date(Date.UTC(year, mon - 1, 1)),
    to: new Date(Date.UTC(year, mon, 0)),
  };
}
