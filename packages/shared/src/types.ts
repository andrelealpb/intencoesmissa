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
