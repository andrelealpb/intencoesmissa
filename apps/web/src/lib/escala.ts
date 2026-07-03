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
  isActive: boolean;
  _count?: { memberships: number; functions: number };
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
