/**
 * Escala — Montagem da grade do coordenador (S8, parte pura).
 *
 * Função **pura** (sem I/O): dado o mês de UMA equipe (ocorrências + demanda +
 * vínculos), as atribuições vivas do mês em **todas** as equipes e a
 * disponibilidade, monta a grade que a tela do coordenador consome:
 *   - por ocorrência, uma vaga (`slot`) por função com demanda;
 *   - cada vaga com as atribuições já feitas (rascunho e publicadas);
 *   - `gaps` **recalculados** (o motivo da lacuna, mesma taxonomia da S7);
 *   - por vaga, a lista **priorizada** de candidatos qualificados com as flags
 *     `eligible` / `reason` / `conflict` (V2/V3).
 *
 * Reusa as funções puras já testadas — `resolveStaffing` (S3, demanda por escopo
 * D6) e `resolveAvailability` (S6, `explicit > rule > default`) — sem reimplementar
 * regra. Espelha as decisões automáticas do planner (A1–A4):
 *   - A1: `default` (não informou) resolve indisponível → `reason: INDISPONIVEL`.
 *   - A2: só quem tem a função qualificada é candidato.
 *   - A3: teto por equipe (D8) → `reason: NO_TETO`.
 *   - A4: uma pessoa por ocorrência (D4/global) → `reason: JA_NA_OCORRENCIA` +
 *     `conflict` apontando onde já serve (visibilidade cruzada — D5/V3).
 *
 * **Não** aloca nada (isso é o `POST /escala/assignments`, decisão humana — D11):
 * apenas classifica o estado atual para a UI.
 */

import {
  resolveStaffing,
  type StaffingRule,
  type OccurrenceDescriptor,
} from "./resolve-staffing";
import {
  resolveAvailability,
  type AvailabilityRuleInput,
  type AvailabilitySource,
} from "./resolve-availability";
import type {
  GapReason,
  PlanOccurrence,
  PlanFunction,
  PlanMembership,
} from "./suggest-schedule";

// Por que um candidato qualificado está excluído desta vaga (V2/V3). A ausência
// (`null`) significa elegível — pode ser escalado sem override.
export type CandidateReason =
  | "JA_NA_OCORRENCIA" // já escalado nesta ocorrência (A4/D4; conflito — D5/V3)
  | "INDISPONIVEL" // sem disponibilidade efetiva AVAILABLE (A1)
  | "NO_TETO"; // atingiu o teto por equipe (A3/D8)

// Onde um candidato em contenda já serve nesta ocorrência (visibilidade cruzada
// — D5/V3: "Ana — já na MESC, 10h").
export interface CandidateConflict {
  teamId: string;
  teamName: string;
  functionId: string;
  functionName: string;
}

export interface GridCandidate {
  memberId: string;
  memberName: string;
  available: boolean;
  availabilitySource: AvailabilitySource;
  assignmentsInTeamMonth: number; // carga na equipe no mês (para o teto/A3)
  maxAssignmentsPerMonth: number | null;
  atCap: boolean;
  alreadyInOccurrence: boolean;
  eligible: boolean;
  reason: CandidateReason | null;
  conflict: CandidateConflict | null;
}

// Vínculo com o nome do membro (para exibir na grade).
export interface GridMembership extends PlanMembership {
  memberName: string;
}

export interface GridTeam {
  id: string;
  name: string;
  functions: PlanFunction[];
  staffing: StaffingRule[];
  memberships: GridMembership[];
}

// Atribuição viva no mês (qualquer equipe; exceto CANCELLED). Ocupa a vaga e a
// ocorrência (A4/A5).
export interface GridExistingAssignment {
  assignmentId: string;
  occurrenceId: string;
  teamId: string;
  teamName: string;
  functionId: string;
  functionName: string;
  memberId: string;
  memberName: string;
  status: string;
  published: boolean; // publishedAt != null
  overrideReason: string | null;
}

export interface GridInput {
  occurrences: PlanOccurrence[];
  team: GridTeam;
  // Atribuições vivas do mês em TODAS as equipes (A4 é global por ocorrência).
  existing: GridExistingAssignment[];
  entries: Map<string, { status: string }>; // `${memberId}|${occurrenceId}`
  rulesByMember: Map<string, AvailabilityRuleInput[]>;
}

export interface GridSlotAssignment {
  assignmentId: string;
  memberId: string;
  memberName: string;
  status: string;
  published: boolean;
  overrideReason: string | null;
}

export interface GridSlot {
  functionId: string;
  functionName: string;
  required: number;
  filled: number;
  missing: number;
  assignments: GridSlotAssignment[];
  // Motivo da lacuna quando `missing > 0` e **nenhum** candidato elegível resta
  // (lacuna "dura"); `null` quando a vaga está cheia OU ainda há elegível para
  // preencher (lacuna preenchível — o coordenador resolve pela lista).
  gap: GapReason | null;
  candidates: GridCandidate[];
}

export interface GridOccurrence {
  occurrenceId: string;
  date: string;
  time: string;
  weekday: number;
  isSolemnity: boolean;
  slots: GridSlot[];
}

export interface ScheduleGridResult {
  occurrences: GridOccurrence[];
}

// ── Helpers de chave ──────────────────────────────────
const occMemberKey = (memberId: string, occurrenceId: string) =>
  `${memberId}|${occurrenceId}`;
const slotKey = (occurrenceId: string, teamId: string, functionId: string) =>
  `${occurrenceId}|${teamId}|${functionId}`;

/** Comparador de string estável (determinismo — J4). */
function byString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Monta a grade do mês para uma equipe. Determinística: ocorrências por
 * data/hora/id, funções por sortOrder/id, candidatos elegíveis primeiro
 * (por carga na equipe ↑, nome, id) e excluídos depois (por motivo, nome, id).
 */
export function buildScheduleGrid(input: GridInput): ScheduleGridResult {
  const team = input.team;

  // Carga do membro NA EQUIPE no mês (para o teto/A3) e ocupação por ocorrência
  // (A4 — qualquer equipe): quem já serve na ocorrência e onde.
  const teamLoad = new Map<string, number>(); // memberId → nº de vagas na equipe
  const occupancy = new Map<string, CandidateConflict>(); // memberId|occ → onde serve
  const filled = new Map<string, GridSlotAssignment[]>(); // occ|team|func → atribuições da vaga

  for (const a of input.existing) {
    occupancy.set(occMemberKey(a.memberId, a.occurrenceId), {
      teamId: a.teamId,
      teamName: a.teamName,
      functionId: a.functionId,
      functionName: a.functionName,
    });
    if (a.teamId === team.id) {
      teamLoad.set(a.memberId, (teamLoad.get(a.memberId) ?? 0) + 1);
      const key = slotKey(a.occurrenceId, a.teamId, a.functionId);
      const list = filled.get(key) ?? [];
      list.push({
        assignmentId: a.assignmentId,
        memberId: a.memberId,
        memberName: a.memberName,
        status: a.status,
        published: a.published,
        overrideReason: a.overrideReason,
      });
      filled.set(key, list);
    }
  }

  // Cache de disponibilidade por (membro, ocorrência) — não depende da função.
  const availabilityCache = new Map<
    string,
    { available: boolean; source: AvailabilitySource }
  >();
  const availabilityOf = (memberId: string, occ: PlanOccurrence) => {
    const key = occMemberKey(memberId, occ.id);
    const cached = availabilityCache.get(key);
    if (cached !== undefined) return cached;
    const entry = input.entries.get(key) ?? null;
    const rules = input.rulesByMember.get(memberId) ?? [];
    const resolved = resolveAvailability(
      { weekday: occ.weekday, time: occ.time },
      entry ? { status: entry.status } : null,
      rules,
    );
    const value = {
      available: resolved.status === "AVAILABLE",
      source: resolved.source,
    };
    availabilityCache.set(key, value);
    return value;
  };

  const occurrences = [...input.occurrences].sort(
    (a, b) =>
      byString(a.date, b.date) || byString(a.time, b.time) || byString(a.id, b.id),
  );

  const result: GridOccurrence[] = [];

  for (const occ of occurrences) {
    const descriptor: OccurrenceDescriptor = {
      weekday: occ.weekday,
      scheduleId: occ.scheduleId,
      exceptionId: occ.exceptionId,
      isSolemnity: occ.isSolemnity,
    };
    const demand = resolveStaffing(descriptor, team.staffing); // functionId → requiredCount
    if (demand.size === 0) continue;

    const functions = [...team.functions]
      .filter((f) => (demand.get(f.id) ?? 0) > 0)
      .sort((a, b) => a.sortOrder - b.sortOrder || byString(a.id, b.id));

    const slots: GridSlot[] = [];

    for (const fn of functions) {
      const required = demand.get(fn.id) ?? 0;
      const slotAssignments = filled.get(slotKey(occ.id, team.id, fn.id)) ?? [];
      const filledCount = slotAssignments.length;
      const missing = Math.max(0, required - filledCount);

      // Candidatos = vínculos qualificados na função (A2), EXCETO quem já preenche
      // esta mesma vaga (esses aparecem em `assignments`).
      const filledMemberIds = new Set(slotAssignments.map((s) => s.memberId));
      const candidates: GridCandidate[] = team.memberships
        .filter(
          (m) =>
            m.qualifiedFunctionIds.includes(fn.id) &&
            !filledMemberIds.has(m.memberId),
        )
        .map((m) => classify(m, occ, fn, team, teamLoad, occupancy, availabilityOf));

      candidates.sort(compareCandidates);

      slots.push({
        functionId: fn.id,
        functionName: fn.name,
        required,
        filled: filledCount,
        missing,
        assignments: slotAssignments,
        gap: gapReason(missing, candidates),
        candidates,
      });
    }

    result.push({
      occurrenceId: occ.id,
      date: occ.date,
      time: occ.time,
      weekday: occ.weekday,
      isSolemnity: occ.isSolemnity,
      slots,
    });
  }

  return { occurrences: result };
}

/**
 * Classifica um candidato qualificado para uma vaga — o coração da lógica de
 * `eligible` / `reason` / `conflict` (V2/V3). Precedência da exclusão:
 * `JA_NA_OCORRENCIA` (A4, "dura" — vira 409 no POST) > `INDISPONIVEL` (A1) >
 * `NO_TETO` (A3). Elegível = disponível **e** sob o teto **e** livre na ocorrência.
 */
function classify(
  m: GridMembership,
  occ: PlanOccurrence,
  fn: PlanFunction,
  team: GridTeam,
  teamLoad: Map<string, number>,
  occupancy: Map<string, CandidateConflict>,
  availabilityOf: (
    memberId: string,
    occ: PlanOccurrence,
  ) => { available: boolean; source: AvailabilitySource },
): GridCandidate {
  const { available, source } = availabilityOf(m.memberId, occ);
  const load = teamLoad.get(m.memberId) ?? 0;
  const atCap =
    m.maxAssignmentsPerMonth != null && load >= m.maxAssignmentsPerMonth;
  const conflict = occupancy.get(occMemberKey(m.memberId, occ.id)) ?? null;
  const alreadyInOccurrence = conflict !== null;

  // Motivo dominante (só quando NÃO elegível). A4 vence: já está na missa.
  let reason: CandidateReason | null = null;
  if (alreadyInOccurrence) reason = "JA_NA_OCORRENCIA";
  else if (!available) reason = "INDISPONIVEL";
  else if (atCap) reason = "NO_TETO";

  return {
    memberId: m.memberId,
    memberName: m.memberName,
    available,
    availabilitySource: source,
    assignmentsInTeamMonth: load,
    maxAssignmentsPerMonth: m.maxAssignmentsPerMonth,
    atCap,
    alreadyInOccurrence,
    eligible: reason === null,
    reason,
    conflict,
  };
}

/**
 * Motivo da lacuna (mesma taxonomia da S7), recalculado no snapshot:
 *  - `null`                 → vaga cheia OU ainda há elegível para preencher.
 *  - `SEM_QUALIFICADO`      → nenhum candidato qualificado.
 *  - `SEM_DISPONIVEL`       → havia qualificados, nenhum disponível.
 *  - `TODOS_NO_TETO`        → havia disponíveis, todos no teto ou já na ocorrência.
 */
function gapReason(
  missing: number,
  candidates: GridCandidate[],
): GapReason | null {
  if (missing <= 0) return null;
  if (candidates.some((c) => c.eligible)) return null; // preenchível — sem gap "duro"
  if (candidates.length === 0) return "SEM_QUALIFICADO";
  if (!candidates.some((c) => c.available && !c.alreadyInOccurrence))
    return "SEM_DISPONIVEL";
  return "TODOS_NO_TETO";
}

/**
 * Ordem da lista: elegíveis primeiro (por menor carga na equipe → nome → id,
 * espelhando J1), excluídos depois (por severidade do motivo → nome → id).
 */
function compareCandidates(a: GridCandidate, b: GridCandidate): number {
  if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
  if (a.eligible) {
    if (a.assignmentsInTeamMonth !== b.assignmentsInTeamMonth)
      return a.assignmentsInTeamMonth - b.assignmentsInTeamMonth;
    return byString(a.memberName, b.memberName) || byString(a.memberId, b.memberId);
  }
  const rank: Record<CandidateReason, number> = {
    INDISPONIVEL: 0,
    NO_TETO: 1,
    JA_NA_OCORRENCIA: 2,
  };
  const ra = a.reason ? rank[a.reason] : 3;
  const rb = b.reason ? rank[b.reason] : 3;
  if (ra !== rb) return ra - rb;
  return byString(a.memberName, b.memberName) || byString(a.memberId, b.memberId);
}
