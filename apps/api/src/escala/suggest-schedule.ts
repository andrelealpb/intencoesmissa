/**
 * Escala — Planner puro de sugestão de escala (S7).
 *
 * Função **pura** (sem I/O): dada a demanda do mês (ocorrências + equipes),
 * as atribuições já existentes e a disponibilidade, devolve os rascunhos a
 * criar (`toCreate`) e as lacunas (`gaps`) com o motivo categorizado.
 *
 * É onde vivem as regras de justiça **J1–J4** e as decisões automáticas
 * **A1–A6** (ver `docs/escala/ESCALA_07_algoritmo_sugestao.md`). Reusa as
 * funções puras já testadas de S3 e S6:
 *   - `resolveStaffing`     — demanda por função por ocorrência (escopo D6).
 *   - `resolveAvailability` — disponibilidade efetiva (`explicit > rule > default`).
 *
 * **Justiça:** entre os elegíveis, ordena por **J1** (menos atribuições **no mês
 * inteiro**, somando todas as equipes — balanceia a carga *total* da pessoa),
 * depois **J2** (**há mais tempo sem servir** — `lastServedAt` menor primeiro,
 * semeado do histórico anterior ao mês e atualizado durante a corrida), depois
 * **J4** (`memberId`). O `TeamMembership.priority` **não** é desempate de
 * justiça — resolve contenda entre equipes (D5) e fica para a S8.
 *
 * **Determinístico (J4):** toda escolha e desempate usa ordenação total e
 * explícita; o algoritmo nunca depende da ordem de iteração do banco nem de
 * aleatoriedade. **Nunca relaxa uma regra (J3):** a vaga que não casa com as
 * regras vira lacuna, não uma atribuição forçada.
 */

import {
  resolveStaffing,
  type StaffingRule,
  type OccurrenceDescriptor,
} from "./resolve-staffing";
import {
  resolveAvailability,
  type AvailabilityRuleInput,
} from "./resolve-availability";

// Motivo de uma vaga não preenchida (cascata de elegibilidade).
export type GapReason =
  | "SEM_QUALIFICADO" // nenhum membro qualificado para a função na equipe (A2/A6)
  | "SEM_DISPONIVEL" // havia qualificados, mas nenhum/insuficientes disponíveis (A1)
  | "TODOS_NO_TETO"; // havia disponíveis, mas no teto (A3) ou já servindo (A4)

// ── Entradas do planner (subconjuntos estruturais dos modelos Prisma) ──

export interface PlanOccurrence {
  id: string;
  date: string; // YYYY-MM-DD (só p/ o relatório da lacuna)
  weekday: number; // 0=Dom..6=Sáb
  time: string; // "HH:mm"
  isSolemnity: boolean;
  scheduleId: string | null; // sourceScheduleId
  exceptionId: string | null; // sourceExceptionId
}

export interface PlanFunction {
  id: string;
  name: string;
  sortOrder: number;
}

export interface PlanMembership {
  memberId: string;
  maxAssignmentsPerMonth: number | null; // teto por equipe (D8); null = sem teto
  qualifiedFunctionIds: string[]; // funções que o membro pode exercer nesta equipe (A2)
}

export interface PlanTeam {
  id: string;
  name: string;
  functions: PlanFunction[];
  staffing: StaffingRule[];
  memberships: PlanMembership[];
}

// Atribuição já existente (rascunho ou publicada, exceto CANCELLED). Ocupa vaga
// e conta para carga/ocupação (A4/A5). Pode ser de qualquer equipe (A4 é global
// por ocorrência).
export interface PlanExistingAssignment {
  occurrenceId: string;
  teamId: string;
  functionId: string;
  memberId: string;
}

export interface PlanInput {
  occurrences: PlanOccurrence[];
  teams: PlanTeam[];
  existing: PlanExistingAssignment[];
  // Desvio explícito por (memberId, occurrenceId) — chave `${memberId}|${occurrenceId}`.
  entries: Map<string, { status: string }>;
  // Regras recorrentes por membro.
  rulesByMember: Map<string, AvailabilityRuleInput[]>;
  // J2: data (YYYY-MM-DD) do último serviço do membro **antes** do mês. Ausente =
  // nunca serviu (entra na frente do rodízio). Atualizado durante a corrida.
  lastServedByMember: Map<string, string>;
}

export interface PlannedAssignment {
  occurrenceId: string;
  teamId: string;
  functionId: string;
  memberId: string;
}

export interface Gap {
  occurrenceId: string;
  date: string;
  time: string;
  teamId: string;
  teamName: string;
  functionId: string;
  functionName: string;
  required: number;
  filled: number;
  missing: number;
  reason: GapReason;
}

export interface PlanResult {
  toCreate: PlannedAssignment[];
  gaps: Gap[];
}

// ── Helpers de chave (sem I/O) ─────────────────────────
const occMemberKey = (memberId: string, occurrenceId: string) =>
  `${memberId}|${occurrenceId}`;
const memberTeamKey = (memberId: string, teamId: string) =>
  `${memberId}|${teamId}`;
const slotKey = (occurrenceId: string, teamId: string, functionId: string) =>
  `${occurrenceId}|${teamId}|${functionId}`;

/** Comparador de string estável (J4). */
function byString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Gera o rascunho de escala do mês. Guloso e determinístico.
 */
export function planSchedule(input: PlanInput): PlanResult {
  const toCreate: PlannedAssignment[] = [];
  const gaps: Gap[] = [];

  // Estado mutável do guloso, semeado pelas atribuições existentes (A5).
  const occupancy = new Set<string>(); // memberId|occurrenceId → já nessa ocorrência (A4)
  const monthLoad = new Map<string, number>(); // memberId → carga TOTAL no mês, todas as equipes (J1)
  const teamLoad = new Map<string, number>(); // memberId|teamId → carga na equipe no mês (A3/teto)
  const filled = new Map<string, number>(); // occ|team|func → vagas já preenchidas (A5)
  // J2: último serviço do membro. Semeado do histórico anterior ao mês; atualizado
  // durante a corrida ao escalar (menor = serviu há mais tempo = entra na frente).
  const lastServed = new Map<string, string>(input.lastServedByMember);

  for (const a of input.existing) {
    occupancy.add(occMemberKey(a.memberId, a.occurrenceId));
    monthLoad.set(a.memberId, (monthLoad.get(a.memberId) ?? 0) + 1);
    teamLoad.set(memberTeamKey(a.memberId, a.teamId), (teamLoad.get(memberTeamKey(a.memberId, a.teamId)) ?? 0) + 1);
    filled.set(slotKey(a.occurrenceId, a.teamId, a.functionId), (filled.get(slotKey(a.occurrenceId, a.teamId, a.functionId)) ?? 0) + 1);
  }

  // Cache de disponibilidade por (membro, ocorrência) — não depende da função.
  const availabilityCache = new Map<string, boolean>();
  const isAvailable = (memberId: string, occ: PlanOccurrence): boolean => {
    const key = occMemberKey(memberId, occ.id);
    const cached = availabilityCache.get(key);
    if (cached !== undefined) return cached;
    const entry = input.entries.get(key) ?? null;
    const rules = input.rulesByMember.get(memberId) ?? [];
    // A1: `default` (não informou) resolve como UNAVAILABLE → nunca escala.
    const resolved = resolveAvailability(
      { weekday: occ.weekday, time: occ.time },
      entry ? { status: entry.status } : null,
      rules,
    );
    const available = resolved.status === "AVAILABLE";
    availabilityCache.set(key, available);
    return available;
  };

  // Ordem determinística das ocorrências (data → hora → id) e equipes (nome → id).
  const occurrences = [...input.occurrences].sort(
    (a, b) =>
      byString(a.date, b.date) || byString(a.time, b.time) || byString(a.id, b.id),
  );
  const teams = [...input.teams].sort(
    (a, b) => byString(a.name, b.name) || byString(a.id, b.id),
  );

  for (const occ of occurrences) {
    const descriptor: OccurrenceDescriptor = {
      weekday: occ.weekday,
      scheduleId: occ.scheduleId,
      exceptionId: occ.exceptionId,
      isSolemnity: occ.isSolemnity,
    };

    for (const team of teams) {
      const demand = resolveStaffing(descriptor, team.staffing); // functionId → requiredCount
      if (demand.size === 0) continue;

      // Funções ordenadas (sortOrder → id) — só as que têm demanda.
      const functions = [...team.functions]
        .filter((f) => (demand.get(f.id) ?? 0) > 0)
        .sort((a, b) => a.sortOrder - b.sortOrder || byString(a.id, b.id));

      for (const fn of functions) {
        const required = demand.get(fn.id) ?? 0;
        const key = slotKey(occ.id, team.id, fn.id);
        const alreadyFilled = filled.get(key) ?? 0;
        const remaining = required - alreadyFilled;
        if (remaining <= 0) continue; // A5: vaga já preenchida.

        // Cascata de candidatos (A2 → A1 → A3/A4).
        const qualified = team.memberships.filter((m) =>
          m.qualifiedFunctionIds.includes(fn.id),
        );
        if (qualified.length === 0) {
          gaps.push(gap(occ, team, fn, required, alreadyFilled, remaining, "SEM_QUALIFICADO"));
          continue;
        }

        const availableQualified = qualified.filter((m) => isAvailable(m.memberId, occ));
        if (availableQualified.length === 0) {
          gaps.push(gap(occ, team, fn, required, alreadyFilled, remaining, "SEM_DISPONIVEL"));
          continue;
        }

        const eligible = availableQualified.filter((m) => {
          if (occupancy.has(occMemberKey(m.memberId, occ.id))) return false; // A4
          if (m.maxAssignmentsPerMonth == null) return true; // A3: sem teto
          const current = teamLoad.get(memberTeamKey(m.memberId, team.id)) ?? 0;
          return current < m.maxAssignmentsPerMonth; // A3: teto é POR EQUIPE
        });

        // Ordena por J1 (carga total no mês ↑) → J2 (há mais tempo sem servir,
        // lastServed ↑; ausente = "" = nunca serviu, entra na frente) → J4 (id ↑).
        eligible.sort((a, b) => {
          const la = monthLoad.get(a.memberId) ?? 0;
          const lb = monthLoad.get(b.memberId) ?? 0;
          if (la !== lb) return la - lb;
          const sa = lastServed.get(a.memberId) ?? "";
          const sb = lastServed.get(b.memberId) ?? "";
          if (sa !== sb) return byString(sa, sb);
          return byString(a.memberId, b.memberId);
        });

        const take = Math.min(remaining, eligible.length);
        for (let i = 0; i < take; i++) {
          const m = eligible[i];
          toCreate.push({
            occurrenceId: occ.id,
            teamId: team.id,
            functionId: fn.id,
            memberId: m.memberId,
          });
          occupancy.add(occMemberKey(m.memberId, occ.id));
          monthLoad.set(m.memberId, (monthLoad.get(m.memberId) ?? 0) + 1);
          teamLoad.set(memberTeamKey(m.memberId, team.id), (teamLoad.get(memberTeamKey(m.memberId, team.id)) ?? 0) + 1);
          filled.set(key, (filled.get(key) ?? 0) + 1);
          // J2: passa a ter servido nesta data (ocorrências processadas em ordem
          // crescente de data → só avança).
          lastServed.set(m.memberId, occ.date);
        }

        const missing = remaining - take;
        if (missing > 0) {
          // J3: não relaxa — reporta a lacuna. O motivo do que sobrou:
          //  - alguns disponíveis foram barrados pelo teto/ocupação → TODOS_NO_TETO;
          //  - não havia disponíveis suficientes (ninguém barrado) → SEM_DISPONIVEL.
          const reason: GapReason =
            eligible.length < availableQualified.length ? "TODOS_NO_TETO" : "SEM_DISPONIVEL";
          gaps.push(gap(occ, team, fn, required, alreadyFilled + take, missing, reason));
        }
      }
    }
  }

  return { toCreate, gaps };
}

function gap(
  occ: PlanOccurrence,
  team: PlanTeam,
  fn: PlanFunction,
  required: number,
  filledCount: number,
  missing: number,
  reason: GapReason,
): Gap {
  return {
    occurrenceId: occ.id,
    date: occ.date,
    time: occ.time,
    teamId: team.id,
    teamName: team.name,
    functionId: fn.id,
    functionName: fn.name,
    required,
    filled: filledCount,
    missing,
    reason,
  };
}
