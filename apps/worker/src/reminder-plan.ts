import { ReminderKind } from '@missas/shared';

/**
 * Escala — Seleção de lembretes (S9, parte PURA).
 *
 * Dado o "relógio" (data civil + minutos do dia, no fuso da paróquia), a config
 * de antecedências e a lista de assignments **publicados** com dados da missa,
 * decide **o que** enviar neste tick. Não faz I/O, não sabe de Z-API nem de
 * banco — só regra. O `ReminderService` cuida de consultar, deduplicar
 * (`ReminderLog`) e enviar (via `MessageProvider`).
 *
 * Grão do alvo (justificado no PR):
 *   - INDIVIDUAL_EVE / INDIVIDUAL_DAY → `targetKey = assignmentId` (1 por
 *     escalação e por tipo — a pessoa recebe no máximo 1 véspera + 1 no dia).
 *   - GROUP_SUMMARY                   → `targetKey = teamId:YYYY-MM-DD` (1 por
 *     equipe e por dia; várias missas da equipe no mesmo dia colapsam em 1 msg).
 *
 * A `@@unique([kind, targetKey])` do `ReminderLog` é a garantia final de
 * idempotência; aqui já deduplicamos por (kind, targetKey) para não tentar N
 * envios do mesmo resumo de grupo no mesmo tick.
 */

/** "Relógio" civil no fuso da paróquia. */
export interface SpClock {
  /** Data civil YYYY-MM-DD. */
  dateStr: string;
  /** Minutos desde a meia-noite (0..1439). */
  minutes: number;
}

/** Antecedências configuráveis por paróquia (L2), já com defaults resolvidos. */
export interface ReminderConfig {
  reminderEveHour: number; // hora (0..23) da véspera p/ o lembrete individual
  reminderSameDayHoursBefore: number | null; // no dia, N horas antes; null = off
  reminderGroupSummaryDaysBefore: number; // resumo no grupo N dias antes
}

/** Um assignment publicado (candidato a lembrete) com o contexto da missa. */
export interface ReminderCandidate {
  assignmentId: string;
  parishId: string;
  teamId: string;
  teamName: string;
  teamWhatsappGroupId: string | null;
  functionName: string;
  memberId: string;
  memberName: string;
  memberPhone: string | null;
  occurrenceId: string;
  occurrenceDate: string; // YYYY-MM-DD
  occurrenceTime: string; // HH:mm
}

export type ReminderRecipientKind = 'INDIVIDUAL' | 'GROUP';

/** Um lembrete a enviar — o alvo (`to`) pode ser null (sem telefone/grupo). */
export interface PlannedReminder {
  kind: ReminderKind;
  targetKey: string;
  recipientKind: ReminderRecipientKind;
  to: string | null; // telefone (individual) ou groupId (grupo); null → pular
  parishId: string;
  teamId: string;
  teamName: string;
  assignmentId: string | null;
  occurrenceId: string | null;
  occurrenceDate: string; // YYYY-MM-DD
  occurrenceTime: string | null; // null no resumo de grupo (cobre o dia)
  memberName: string | null;
  functionName: string | null;
}

/**
 * Seleciona os lembretes deste tick. Determinística e sem I/O.
 */
export function planReminders(
  clock: SpClock,
  config: ReminderConfig,
  candidates: ReminderCandidate[],
): PlannedReminder[] {
  const planned: PlannedReminder[] = [];
  const seen = new Set<string>();

  const push = (r: PlannedReminder) => {
    const key = `${r.kind}|${r.targetKey}`;
    if (seen.has(key)) return;
    seen.add(key);
    planned.push(r);
  };

  for (const c of candidates) {
    const daysUntil = civilDaysBetween(clock.dateStr, c.occurrenceDate);
    if (daysUntil < 0) continue; // missa no passado — nunca lembra

    // GROUP_SUMMARY: N dias antes; 1 msg por (equipe, dia).
    if (daysUntil === config.reminderGroupSummaryDaysBefore) {
      push({
        kind: ReminderKind.GROUP_SUMMARY,
        targetKey: `${c.teamId}:${c.occurrenceDate}`,
        recipientKind: 'GROUP',
        to: c.teamWhatsappGroupId,
        parishId: c.parishId,
        teamId: c.teamId,
        teamName: c.teamName,
        assignmentId: null,
        occurrenceId: null,
        occurrenceDate: c.occurrenceDate,
        occurrenceTime: null,
        memberName: null,
        functionName: null,
      });
    }

    // INDIVIDUAL_EVE: na véspera, a partir da hora configurada.
    if (daysUntil === 1 && clock.minutes >= config.reminderEveHour * 60) {
      push(individual(ReminderKind.INDIVIDUAL_EVE, c));
    }

    // INDIVIDUAL_DAY (opcional): no dia, a partir de N horas antes da missa.
    if (config.reminderSameDayHoursBefore != null && daysUntil === 0) {
      const massMinutes = timeToMinutes(c.occurrenceTime);
      if (
        massMinutes != null &&
        clock.minutes >= massMinutes - config.reminderSameDayHoursBefore * 60
      ) {
        push(individual(ReminderKind.INDIVIDUAL_DAY, c));
      }
    }
  }

  return planned;
}

function individual(
  kind: ReminderKind,
  c: ReminderCandidate,
): PlannedReminder {
  return {
    kind,
    targetKey: c.assignmentId,
    recipientKind: 'INDIVIDUAL',
    to: c.memberPhone,
    parishId: c.parishId,
    teamId: c.teamId,
    teamName: c.teamName,
    assignmentId: c.assignmentId,
    occurrenceId: c.occurrenceId,
    occurrenceDate: c.occurrenceDate,
    occurrenceTime: c.occurrenceTime,
    memberName: c.memberName,
    functionName: c.functionName,
  };
}

/**
 * Texto do lembrete. `portalLink` é o link do portal do membro (S6) — a
 * confirmação/recusa acontece **lá** (L3), nunca por resposta de WhatsApp.
 */
export function buildReminderMessage(
  r: PlannedReminder,
  portalLink: string,
): string {
  const dia = formatBrDate(r.occurrenceDate);
  if (r.recipientKind === 'GROUP') {
    return (
      `Escala de ${r.teamName} para ${dia} publicada. ` +
      `Confira se voce esta escalado(a) e confirme em: ${portalLink}`
    );
  }
  const hora = r.occurrenceTime ? ` as ${r.occurrenceTime}` : '';
  const funcao = r.functionName ? ` (${r.functionName})` : '';
  const nome = r.memberName ? `${firstName(r.memberName)}, ` : '';
  return (
    `${nome}voce esta escalado(a) na missa de ${dia}${hora}${funcao}. ` +
    `Confirme ou avise se nao puder em: ${portalLink}`
  );
}

// ── Helpers puros ─────────────────────────────────────

/** Diferença em dias civis entre duas datas YYYY-MM-DD (b - a). */
export function civilDaysBetween(a: string, b: string): number {
  const da = Date.UTC(
    Number(a.slice(0, 4)),
    Number(a.slice(5, 7)) - 1,
    Number(a.slice(8, 10)),
  );
  const db = Date.UTC(
    Number(b.slice(0, 4)),
    Number(b.slice(5, 7)) - 1,
    Number(b.slice(8, 10)),
  );
  return Math.round((db - da) / 86_400_000);
}

/** "HH:mm" → minutos do dia; null se malformado. */
export function timeToMinutes(time: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** YYYY-MM-DD → DD/MM. */
function formatBrDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
