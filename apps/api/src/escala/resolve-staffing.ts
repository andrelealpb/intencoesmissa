import { StaffingScope } from "@missas/shared";

/**
 * Descritor mínimo de uma ocorrência de missa para resolução de demanda.
 * Desacoplado do modelo Prisma de propósito — a ligação com `MassOccurrence`
 * real acontece onde é consumido (S7).
 */
export interface OccurrenceDescriptor {
  weekday: number;
  scheduleId: string | null;
  exceptionId: string | null;
  isSolemnity: boolean;
}

/**
 * Regra de demanda (staffing) — subconjunto estrutural do modelo
 * `StaffingRequirement` do Prisma. Só o necessário para resolver.
 */
export interface StaffingRule {
  functionId: string;
  requiredCount: number;
  scope: StaffingScope;
  weekday?: number | null;
  massScheduleId?: string | null;
  massExceptionId?: string | null;
  isActive?: boolean;
}

// Especificidade do escopo (maior número = mais específico vence). D6:
// OCCASION > SOLEMNITY > SCHEDULE > WEEKDAY > DEFAULT.
const SCOPE_PRIORITY: Record<StaffingScope, number> = {
  [StaffingScope.DEFAULT]: 0,
  [StaffingScope.WEEKDAY]: 1,
  [StaffingScope.SCHEDULE]: 2,
  [StaffingScope.SOLEMNITY]: 3,
  [StaffingScope.OCCASION]: 4,
};

/**
 * Verifica se uma regra se aplica a uma ocorrência dada.
 */
function ruleMatches(
  rule: StaffingRule,
  occurrence: OccurrenceDescriptor,
): boolean {
  switch (rule.scope) {
    case StaffingScope.DEFAULT:
      return true;
    case StaffingScope.WEEKDAY:
      return rule.weekday === occurrence.weekday;
    case StaffingScope.SCHEDULE:
      return (
        occurrence.scheduleId !== null &&
        rule.massScheduleId === occurrence.scheduleId
      );
    case StaffingScope.SOLEMNITY:
      return occurrence.isSolemnity === true;
    case StaffingScope.OCCASION:
      return (
        occurrence.exceptionId !== null &&
        rule.massExceptionId === occurrence.exceptionId
      );
    default:
      return false;
  }
}

/**
 * Função **pura** (sem I/O): dado o descritor de uma ocorrência e as regras de
 * uma equipe, retorna a demanda resolvida por função.
 *
 * Para cada função, a regra mais específica que casa vence (D6):
 * `OCCASION > SOLEMNITY > SCHEDULE > WEEKDAY > DEFAULT`. Empate de escopo
 * (não deveria ocorrer com dados sãos) resolve pela maior `requiredCount`.
 *
 * @returns Map de `functionId` → `requiredCount` resolvido.
 */
export function resolveStaffing(
  occurrence: OccurrenceDescriptor,
  rules: StaffingRule[],
): Map<string, number> {
  // functionId → { priority, requiredCount } da melhor regra até agora.
  const best = new Map<string, { priority: number; requiredCount: number }>();

  for (const rule of rules) {
    if (rule.isActive === false) continue;
    if (!ruleMatches(rule, occurrence)) continue;

    const priority = SCOPE_PRIORITY[rule.scope];
    const current = best.get(rule.functionId);

    if (
      !current ||
      priority > current.priority ||
      (priority === current.priority && rule.requiredCount > current.requiredCount)
    ) {
      best.set(rule.functionId, { priority, requiredCount: rule.requiredCount });
    }
  }

  const resolved = new Map<string, number>();
  for (const [functionId, { requiredCount }] of best) {
    resolved.set(functionId, requiredCount);
  }
  return resolved;
}
