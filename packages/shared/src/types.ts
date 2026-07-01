export enum Role {
  SUPER_ADMIN = "SUPER_ADMIN",
  PARISH_ADMIN = "PARISH_ADMIN",
}

export enum IntentionGroup {
  SUFRAGIO = "SUFRAGIO",
  SUPLICAS = "SUPLICAS",
  ACAO_DE_GRACAS = "ACAO_DE_GRACAS",
}

export enum DispatchScope {
  PER_MASS = "PER_MASS",
  PER_DAY = "PER_DAY",
}

export enum EmolumentScope {
  DEFAULT = "DEFAULT",
  GROUP = "GROUP",
  TYPE = "TYPE",
}

export enum RequestStatus {
  SUBMITTED = "SUBMITTED",
  CANCELLED = "CANCELLED",
}

export enum DispatchStatus {
  SENT = "SENT",
  FAILED = "FAILED",
}

// ─── Escala (liturgical service scheduling) ─────────────

export enum MinistryCategory {
  ALTAR_SERVERS = "ALTAR_SERVERS",
  EUCHARISTIC_MINISTERS = "EUCHARISTIC_MINISTERS",
  READERS = "READERS",
  COMMENTATORS = "COMMENTATORS",
  WELCOMING = "WELCOMING",
  TITHE = "TITHE",
  MUSIC = "MUSIC",
  COLLECTION = "COLLECTION",
  DECORATION = "DECORATION",
  SPECIAL = "SPECIAL",
  OTHER = "OTHER",
}

export enum StaffingScope {
  DEFAULT = "DEFAULT",
  WEEKDAY = "WEEKDAY",
  SCHEDULE = "SCHEDULE",
  SOLEMNITY = "SOLEMNITY",
  OCCASION = "OCCASION",
}

export enum AvailabilityStatus {
  AVAILABLE = "AVAILABLE",
  UNAVAILABLE = "UNAVAILABLE",
  MAYBE = "MAYBE",
}

export enum AssignmentStatus {
  SCHEDULED = "SCHEDULED",
  CONFIRMED = "CONFIRMED",
  DECLINED = "DECLINED",
  CANCELLED = "CANCELLED",
}

export enum MemberAuthTokenType {
  MAGIC_LINK = "MAGIC_LINK",
  OTP = "OTP",
}
