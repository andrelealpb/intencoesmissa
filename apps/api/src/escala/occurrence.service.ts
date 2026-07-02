import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { UpdateOccurrenceInput } from "@missas/shared";

/**
 * Escala — Materializacao de ocorrencias (S2).
 *
 * Transforma o calendario calculado on-the-fly das Intencoes em ocorrencias
 * concretas persistidas (`MassOccurrence`) para um intervalo. A operacao e
 * idempotente e preserva flags manuais (isSolemnity/title — D7).
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

    // Calendario da paroquia. Horarios regulares (por weekday) + excecoes do intervalo.
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

    // Monta candidatas para cada dia do intervalo.
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
          await tx.massOccurrence.create({
            data: {
              parishId,
              date: c.date,
              time: c.time,
              title: c.title,
              // isSolemnity comeca false; elevacao e sempre manual via PATCH (convencao (a) do doc).
              sourceScheduleId: c.sourceScheduleId,
              sourceExceptionId: c.sourceExceptionId,
            },
          });
          created++;
        } else {
          await tx.massOccurrence.update({
            where: { id: prev.id },
            data: {
              // Atualiza APENAS a origem. NUNCA mexe em isSolemnity.
              sourceScheduleId: c.sourceScheduleId,
              sourceExceptionId: c.sourceExceptionId,
              // So preenche title se ainda estiver null (nao pisa em titulo editado a mao).
              ...(prev.title == null && c.title != null
                ? { title: c.title }
                : {}),
            },
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

  // Chave de dia civil (YYYY-MM-DD) a partir de uma Date @db.Date (UTC-midnight).
  private dayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  // Chave do slot unico (parishId ja fixado no escopo): dia + horario.
  private slotKey(date: Date, time: string): string {
    return `${this.dayKey(date)}|${time}`;
  }
}
