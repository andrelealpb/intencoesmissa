/**
 * Escala — Resolvedor puro de disponibilidade efetiva (S6).
 *
 * As regras recorrentes **não** materializam entries. Este resolvedor calcula a
 * disponibilidade efetiva sob demanda, eliminando o bug de "mudei a regra e as
 * entries antigas ficaram velhas". A S7 reusa esta mesma função.
 *
 * Precedência (D3/U1/U2/U3): `explicit` > `rule` > `default`.
 *   1. Existe `entry` (desvio explícito) → usa `entry.status`, source=`explicit`.
 *   2. Senão, regra recorrente casa (weekday + time, ou weekday com time=null) →
 *      usa `rule.available`, source=`rule`. A regra de horário específico vence a
 *      de dia inteiro (time=null).
 *   3. Senão → `UNAVAILABLE`, source=`default` (= "não informou", opt-in U1/U2).
 */

// Descritor mínimo da ocorrência — desacoplado do modelo Prisma de propósito.
export interface AvailabilitySlot {
  weekday: number; // 0=Dom..6=Sáb
  time: string; // "HH:mm"
}

// Subconjunto estrutural de `AvailabilityEntry` — só o necessário para resolver.
// `status` é o valor cru do enum `AvailabilityStatus` (aceita tanto o enum do
// Prisma quanto o do `@missas/shared`, nominalmente distintos): "AVAILABLE",
// "UNAVAILABLE" ou "MAYBE".
export interface AvailabilityEntryInput {
  status: string;
}

// Subconjunto estrutural de `MemberAvailabilityRule`.
export interface AvailabilityRuleInput {
  weekday: number;
  time: string | null; // null = qualquer horário do dia (dia inteiro)
  available: boolean;
}

// Status efetivo é binário na UI (U4): MAYBE fica no enum, não é exposto.
export type EffectiveStatus = "AVAILABLE" | "UNAVAILABLE";
export type AvailabilitySource = "explicit" | "rule" | "default";

export interface ResolvedAvailability {
  status: EffectiveStatus;
  source: AvailabilitySource;
}

/**
 * Escolhe a regra que casa com a ocorrência. Horário específico vence dia
 * inteiro (time=null). Retorna `null` se nenhuma regra casa.
 */
function pickRule(
  slot: AvailabilitySlot,
  rules: AvailabilityRuleInput[],
): AvailabilityRuleInput | null {
  let dayWide: AvailabilityRuleInput | null = null;

  for (const rule of rules) {
    if (rule.weekday !== slot.weekday) continue;
    if (rule.time === slot.time) return rule; // casamento exato: mais específico vence
    if (rule.time === null && dayWide === null) dayWide = rule;
  }

  return dayWide;
}

/**
 * Função **pura** (sem I/O): resolve a disponibilidade efetiva de uma ocorrência
 * para um membro, dado seu desvio explícito (se houver) e suas regras.
 */
export function resolveAvailability(
  slot: AvailabilitySlot,
  entry: AvailabilityEntryInput | null,
  rules: AvailabilityRuleInput[],
): ResolvedAvailability {
  // 1. Desvio explícito manda (inclusive quando contradiz a regra).
  if (entry) {
    // Binário na UI (U4): só "AVAILABLE" é disponível; MAYBE/UNAVAILABLE viram
    // UNAVAILABLE efetivo.
    const status: EffectiveStatus =
      entry.status === "AVAILABLE" ? "AVAILABLE" : "UNAVAILABLE";
    return { status, source: "explicit" };
  }

  // 2. Regra recorrente viva.
  const rule = pickRule(slot, rules);
  if (rule) {
    return {
      status: rule.available ? "AVAILABLE" : "UNAVAILABLE",
      source: "rule",
    };
  }

  // 3. Default — não informou. Opt-in: começa indisponível (U1/U2).
  return { status: "UNAVAILABLE", source: "default" };
}
