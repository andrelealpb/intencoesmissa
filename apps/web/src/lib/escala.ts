// Rótulos e tipos compartilhados pelas páginas de admin do módulo Escala
// (/admin/escala/*). Espelham os enums do Prisma/`@missas/shared`.

export const weekdayLabels = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

// MinistryCategory (packages/shared types.ts)
export const categoryLabels: Record<string, string> = {
  ALTAR_SERVERS: 'Coroinhas / Acólitos',
  EUCHARISTIC_MINISTERS: 'Ministros da Eucaristia (MESC)',
  READERS: 'Leitores',
  COMMENTATORS: 'Comentaristas',
  WELCOMING: 'Acolhida',
  TITHE: 'Dízimo',
  MUSIC: 'Música / Canto',
  COLLECTION: 'Coleta',
  DECORATION: 'Decoração',
  SPECIAL: 'Especial',
  OTHER: 'Outro',
};

// StaffingScope (packages/shared types.ts). Ordem = mais específico primeiro,
// espelhando a prioridade de resolução (D6): OCCASION > SOLEMNITY > SCHEDULE >
// WEEKDAY > DEFAULT.
export const scopeLabels: Record<string, string> = {
  DEFAULT: 'Padrão (toda missa)',
  WEEKDAY: 'Por dia da semana',
  SCHEDULE: 'Por horário',
  SOLEMNITY: 'Solenidades',
  OCCASION: 'Ocasião específica',
};

export const scopeOrder = [
  'DEFAULT',
  'WEEKDAY',
  'SCHEDULE',
  'SOLEMNITY',
  'OCCASION',
] as const;

export type StaffingScopeValue = (typeof scopeOrder)[number];

// Alvo que cada escopo exige. DEFAULT/SOLEMNITY não têm alvo.
export function scopeTargetKind(
  scope: string,
): 'weekday' | 'schedule' | 'occasion' | null {
  switch (scope) {
    case 'WEEKDAY':
      return 'weekday';
    case 'SCHEDULE':
      return 'schedule';
    case 'OCCASION':
      return 'occasion';
    default:
      return null;
  }
}

export interface Team {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  whatsappGroupId?: string | null;
  isActive: boolean;
  _count?: { memberships: number; functions: number };
}

// Resumo da convocação de disponibilidade (S6.5).
export interface ConvocationResult {
  teamId: string;
  teamName: string;
  status: 'sent' | 'skipped' | 'failed';
  reason?: string;
}

export interface ConvocationSummary {
  month: string;
  monthLabel: string;
  results: ConvocationResult[];
  sent: number;
  skipped: number;
  failed: number;
}

export interface TeamFunction {
  id: string;
  teamId: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface Member {
  id: string;
  fullName: string;
  phone: string;
  email?: string | null;
  birthDate?: string | null;
  isActive: boolean;
  _count?: { memberships: number };
  warning?: string;
}

export interface Membership {
  id: string;
  teamId: string;
  memberId: string;
  isCoordinator: boolean;
  maxAssignmentsPerMonth?: number | null;
  priority: number;
  isActive: boolean;
  member?: { id: string; fullName: string; phone: string; isActive: boolean };
  qualifications?: { functionId: string }[];
}

export interface StaffingRequirement {
  id: string;
  teamId: string;
  functionId: string;
  requiredCount: number;
  scope: string;
  weekday?: number | null;
  massScheduleId?: string | null;
  massExceptionId?: string | null;
  isActive: boolean;
  function?: { id: string; name: string };
}

export interface Schedule {
  id: string;
  weekday: number;
  time: string;
  isActive: boolean;
}

export interface MassException {
  id: string;
  date: string;
  time: string;
  title?: string | null;
  isActive: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Montagem da escala — tela do coordenador (S8, PR 2 / frontend).
// Tipos espelhando a resposta de GET /escala/schedule (schedule-grid.ts) e os
// endpoints de apoio (POST /escala/assignments, DELETE, POST publish/suggest).
// ─────────────────────────────────────────────────────────────────────────────

// Motivo da lacuna "dura" (nenhum elegível resta) — taxonomia da S7.
export type GapReason = 'SEM_QUALIFICADO' | 'SEM_DISPONIVEL' | 'TODOS_NO_TETO';

// Por que um candidato qualificado está excluído desta vaga (V2/V3).
export type CandidateReason = 'JA_NA_OCORRENCIA' | 'INDISPONIVEL' | 'NO_TETO';

// Onde um candidato em contenda já serve nesta ocorrência (visibilidade cruzada
// D5/V3 — "já na MESC, 10h").
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
  availabilitySource: 'explicit' | 'rule' | 'default';
  assignmentsInTeamMonth: number;
  maxAssignmentsPerMonth: number | null;
  atCap: boolean;
  alreadyInOccurrence: boolean;
  eligible: boolean;
  reason: CandidateReason | null;
  conflict: CandidateConflict | null;
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
  gap: GapReason | null;
  candidates: GridCandidate[];
}

export interface GridOccurrence {
  occurrenceId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  weekday: number; // 0 = domingo
  isSolemnity: boolean;
  slots: GridSlot[];
}

export interface Publication {
  publishedAt: string | null;
  published: boolean;
  hasUnpublishedChanges: boolean;
}

export interface ScheduleGrid {
  month: string;
  teamId: string;
  teamName: string;
  publication: Publication;
  occurrences: GridOccurrence[];
}

// Abreviações de dia da semana (0 = domingo), para o cabeçalho da ocorrência.
export const weekdayAbbrev = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Rótulo da lacuna dura (o motivo mostrado na vaga aberta sem elegível).
export const gapLabels: Record<GapReason, string> = {
  SEM_QUALIFICADO: 'Ninguém qualificado',
  SEM_DISPONIVEL: 'Ninguém disponível',
  TODOS_NO_TETO: 'Todos no teto / já escalados',
};

// Rótulo do motivo de exclusão de um candidato (lista priorizada — V2/V3).
export const candidateReasonLabels: Record<CandidateReason, string> = {
  JA_NA_OCORRENCIA: 'já escalado nesta missa',
  INDISPONIVEL: 'indisponível',
  NO_TETO: 'no teto do mês',
};

// Cabeçalho legível da ocorrência: "Dom 02/08".
export function formatOccurrenceDate(date: string, weekday: number): string {
  const [, mm, dd] = date.split('-');
  const abbr = weekdayAbbrev[weekday] ?? '';
  return `${abbr} ${dd}/${mm}`.trim();
}

// Contenda visível (V3): "já na MESC, 10h" — a partir do conflito + o horário
// da ocorrência que está sendo resolvida.
export function conflictLabel(
  conflict: CandidateConflict,
  occurrenceTime: string,
): string {
  return `já na ${conflict.teamName}, ${occurrenceTime}`;
}

// Divide os candidatos em elegíveis (podem ser escalados direto) e excluídos
// (exigem override consciente ou estão em contenda). O backend já devolve a lista
// ordenada (elegíveis primeiro, por carga ↑); aqui só particiona preservando a
// ordem — a UI de V2 renderiza os dois grupos separados e rotulados.
export function splitCandidates(candidates: GridCandidate[]): {
  eligible: GridCandidate[];
  excluded: GridCandidate[];
} {
  const eligible: GridCandidate[] = [];
  const excluded: GridCandidate[] = [];
  for (const c of candidates) {
    (c.eligible ? eligible : excluded).push(c);
  }
  return { eligible, excluded };
}

// Serviço de uma pessoa no mês (para o painel de conferência da justiça — V1).
export interface PersonService {
  date: string;
  time: string;
  functionName: string;
}

export interface PersonStat {
  memberId: string;
  memberName: string;
  count: number;
  services: PersonService[];
}

// Painel secundário por pessoa (V1 / J1-J2): a partir da grade, tabula por
// membro da equipe quantas vezes serve no mês e em quais datas — para o
// coordenador ver de relance se o rodízio ficou justo. Inclui os qualificados
// com 0 serviços (aparecem como candidatos), não só os já escalados.
export function buildPersonPanel(occurrences: GridOccurrence[]): PersonStat[] {
  const map = new Map<string, PersonStat>();
  const ensure = (memberId: string, memberName: string): PersonStat => {
    let stat = map.get(memberId);
    if (!stat) {
      stat = { memberId, memberName, count: 0, services: [] };
      map.set(memberId, stat);
    }
    return stat;
  };

  for (const occ of occurrences) {
    for (const slot of occ.slots) {
      for (const c of slot.candidates) ensure(c.memberId, c.memberName);
      for (const a of slot.assignments) {
        const stat = ensure(a.memberId, a.memberName);
        stat.count += 1;
        stat.services.push({
          date: occ.date,
          time: occ.time,
          functionName: slot.functionName,
        });
      }
    }
  }

  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.memberName.localeCompare(b.memberName),
  );
}
