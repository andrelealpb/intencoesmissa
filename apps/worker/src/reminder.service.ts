import {
  PrismaClient,
  Prisma,
  AssignmentStatus,
  ReminderKind as PrismaReminderKind,
} from '@prisma/client';
import { MessageProvider } from './message-provider';
import {
  planReminders,
  buildReminderMessage,
  type SpClock,
  type ReminderConfig,
  type ReminderCandidate,
  type PlannedReminder,
} from './reminder-plan';

/**
 * Escala — Job de LEMBRETES (S9), camada de I/O.
 *
 * Roda no worker num cron **isolado** do despacho das Intenções (D9 — nada no
 * fluxo pedido→despacho muda). A cada tick:
 *   1. acha os assignments **publicados** de missas dentro da janela;
 *   2. `planReminders` (puro) decide o que enviar neste tick;
 *   3. para cada lembrete, **reivindica** a chave no `ReminderLog` ANTES de
 *      enviar — a `@@unique([kind, targetKey])` garante que reprocessar o mesmo
 *      tick **não reenvia** (idempotência);
 *   4. envia via `MessageProvider` (Z-API hoje; trocável — L6/R1).
 *
 * Degradação graciosa (padrão do sistema): falha de envio loga, rebaixa o log
 * (success=false) e **segue** — nunca trava o tick nem derruba as outras missas
 * ou paróquias.
 */
export class ReminderService {
  constructor(
    private prisma: PrismaClient,
    private provider: MessageProvider,
    private portalBaseUrl: string,
    /** Fonte do "agora" — injetável para testes determinísticos. */
    private now: () => Date = () => new Date(),
  ) {}

  async checkAndRemind(): Promise<void> {
    const clock = this.spClock();

    // Só paróquias que habilitaram lembretes (gate de R1) e com Z-API mínima.
    const parishes = await this.prisma.parish.findMany({
      where: {
        settings: { remindersEnabled: true },
        zapiInstanceId: { not: null },
        zapiToken: { not: null },
      },
      select: {
        id: true,
        slug: true,
        parishName: true,
        zapiInstanceId: true,
        zapiToken: true,
        zapiClientToken: true,
        settings: {
          select: {
            reminderEveHour: true,
            reminderSameDayHoursBefore: true,
            reminderGroupSummaryDaysBefore: true,
          },
        },
      },
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const parish of parishes) {
      if (!parish.settings) continue;
      try {
        const res = await this.remindParish(parish, clock);
        sent += res.sent;
        skipped += res.skipped;
        failed += res.failed;
      } catch (error) {
        // Degradação graciosa por paróquia — uma não derruba as outras.
        console.error(`[Reminders] Erro na paroquia ${parish.id}:`, error);
      }
    }

    console.log(
      `[Reminders] tick ${clock.dateStr} ${minutesToHHMM(clock.minutes)} (${this.provider.name}): sent=${sent} skipped=${skipped} failed=${failed}`,
    );
  }

  private async remindParish(
    parish: ParishRow,
    clock: SpClock,
  ): Promise<{ sent: number; skipped: number; failed: number }> {
    const settings = parish.settings!;
    const config: ReminderConfig = {
      reminderEveHour: settings.reminderEveHour,
      reminderSameDayHoursBefore: settings.reminderSameDayHoursBefore,
      reminderGroupSummaryDaysBefore: settings.reminderGroupSummaryDaysBefore,
    };

    // Janela: de hoje até o mais distante que importa (o resumo de grupo).
    const horizon = Math.max(config.reminderGroupSummaryDaysBefore, 1);
    const from = utcMidnight(clock.dateStr);
    const to = addDays(from, horizon);

    // Só ESCALADOS (assignments) PUBLICADOS; recusados/cancelados não recebem.
    const assignments = await this.prisma.assignment.findMany({
      where: {
        parishId: parish.id,
        publishedAt: { not: null },
        status: {
          notIn: [AssignmentStatus.DECLINED, AssignmentStatus.CANCELLED],
        },
        occurrence: { date: { gte: from, lte: to } },
      },
      select: {
        id: true,
        occurrence: { select: { id: true, date: true, time: true } },
        team: { select: { id: true, name: true, whatsappGroupId: true } },
        function: { select: { name: true } },
        member: { select: { id: true, fullName: true, phone: true } },
      },
    });

    const candidates: ReminderCandidate[] = assignments.map((a) => ({
      assignmentId: a.id,
      parishId: parish.id,
      teamId: a.team.id,
      teamName: a.team.name,
      teamWhatsappGroupId: a.team.whatsappGroupId,
      functionName: a.function.name,
      memberId: a.member.id,
      memberName: a.member.fullName,
      memberPhone: a.member.phone || null,
      occurrenceId: a.occurrence.id,
      occurrenceDate: dayKey(a.occurrence.date),
      occurrenceTime: a.occurrence.time,
    }));

    const planned = planReminders(clock, config, candidates);
    const portalLink = this.portalLink(parish.slug);

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const r of planned) {
      if (!r.to) {
        // Sem telefone (individual) ou sem grupo (equipe) → pula SEM registrar,
        // para reenviar quando o dado for cadastrado. Degradação graciosa.
        console.warn(
          `[Reminders] sem destino ${r.kind} target=${r.targetKey} parish=${parish.id}`,
        );
        skipped++;
        continue;
      }

      // Idempotência: reivindica a chave ANTES de enviar. Colisão (P2002) = já
      // enviado num tick anterior → não reenvia.
      const claimedId = await this.claim(parish.id, r);
      if (!claimedId) {
        skipped++;
        continue;
      }

      try {
        await this.provider.sendText(
          {
            instanceId: parish.zapiInstanceId as string,
            token: parish.zapiToken as string,
            clientToken: parish.zapiClientToken,
            to: r.to,
          },
          buildReminderMessage(r, portalLink),
        );
        sent++;
      } catch (error) {
        // Falha de envio: rebaixa o log e segue (não reenvia, não trava o tick).
        failed++;
        await this.markFailed(claimedId, error);
        console.error(
          `[Reminders] falha de envio ${r.kind} target=${r.targetKey} parish=${parish.id}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    return { sent, skipped, failed };
  }

  /**
   * Reivindica a chave de idempotência criando o `ReminderLog`. Retorna o id se
   * criou (segue para o envio) ou `null` se a chave já existia (P2002 → já
   * tratado num tick anterior; não reenvia).
   */
  private async claim(
    parishId: string,
    r: PlannedReminder,
  ): Promise<string | null> {
    try {
      const row = await this.prisma.reminderLog.create({
        data: {
          parishId,
          kind: r.kind as unknown as PrismaReminderKind,
          targetKey: r.targetKey,
          assignmentId: r.assignmentId,
          teamId: r.teamId,
          success: true, // otimista; markFailed rebaixa se o envio falhar
          detail: this.provider.name,
        },
        select: { id: true },
      });
      return row.id;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return null; // já enviado/reivindicado — idempotência
      }
      throw error;
    }
  }

  private async markFailed(id: string, error: unknown): Promise<void> {
    const detail = `${this.provider.name}: ${
      error instanceof Error ? error.message : String(error)
    }`.slice(0, 500);
    try {
      await this.prisma.reminderLog.update({
        where: { id },
        data: { success: false, detail },
      });
    } catch (e) {
      console.error('[Reminders] falha ao rebaixar ReminderLog:', e);
    }
  }

  /** Link do portal do membro (S6) — onde a confirmação/recusa acontece (L3). */
  private portalLink(slug: string): string {
    const base = this.portalBaseUrl.replace(/\/+$/, '');
    return `${base}/p/${slug}/escala/entrar`;
  }

  /** "Relógio" civil no fuso de São Paulo (mesmo padrão do despacho). */
  private spClock(): SpClock {
    const spNow = new Date(
      this.now().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }),
    );
    const dateStr = `${spNow.getFullYear()}-${pad(spNow.getMonth() + 1)}-${pad(
      spNow.getDate(),
    )}`;
    const minutes = spNow.getHours() * 60 + spNow.getMinutes();
    return { dateStr, minutes };
  }
}

// ── Row type + helpers ────────────────────────────────

interface ParishRow {
  id: string;
  slug: string;
  parishName: string;
  zapiInstanceId: string | null;
  zapiToken: string | null;
  zapiClientToken: string | null;
  settings: {
    reminderEveHour: number;
    reminderSameDayHoursBefore: number | null;
    reminderGroupSummaryDaysBefore: number;
  } | null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function utcMidnight(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function minutesToHHMM(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}
