import { StaffingScope } from "@missas/shared";
import {
  resolveStaffing,
  type OccurrenceDescriptor,
  type StaffingRule,
} from "./resolve-staffing";

// função de conveniência p/ montar regras nos testes
function rule(partial: Partial<StaffingRule> & { functionId: string; scope: StaffingScope }): StaffingRule {
  return {
    requiredCount: 1,
    weekday: null,
    massScheduleId: null,
    massExceptionId: null,
    isActive: true,
    ...partial,
  };
}

const SUNDAY_10H: OccurrenceDescriptor = {
  weekday: 0, // domingo
  scheduleId: "sched-10h",
  exceptionId: null,
  isSolemnity: false,
};

const F1 = "func-1";

describe("resolveStaffing", () => {
  it("resolve escopo DEFAULT (qualquer missa)", () => {
    const rules = [rule({ functionId: F1, scope: StaffingScope.DEFAULT, requiredCount: 2 })];
    const result = resolveStaffing(SUNDAY_10H, rules);
    expect(result.get(F1)).toBe(2);
  });

  it("resolve escopo WEEKDAY quando o dia casa", () => {
    const rules = [
      rule({ functionId: F1, scope: StaffingScope.WEEKDAY, weekday: 0, requiredCount: 3 }),
    ];
    expect(resolveStaffing(SUNDAY_10H, rules).get(F1)).toBe(3);
  });

  it("ignora WEEKDAY quando o dia NAO casa", () => {
    const rules = [
      rule({ functionId: F1, scope: StaffingScope.WEEKDAY, weekday: 6, requiredCount: 3 }),
    ];
    expect(resolveStaffing(SUNDAY_10H, rules).has(F1)).toBe(false);
  });

  it("resolve escopo SCHEDULE quando o horario casa", () => {
    const rules = [
      rule({
        functionId: F1,
        scope: StaffingScope.SCHEDULE,
        massScheduleId: "sched-10h",
        requiredCount: 4,
      }),
    ];
    expect(resolveStaffing(SUNDAY_10H, rules).get(F1)).toBe(4);
  });

  it("ignora SCHEDULE de outro horario", () => {
    const rules = [
      rule({
        functionId: F1,
        scope: StaffingScope.SCHEDULE,
        massScheduleId: "sched-19h",
        requiredCount: 4,
      }),
    ];
    expect(resolveStaffing(SUNDAY_10H, rules).has(F1)).toBe(false);
  });

  it("resolve escopo SOLEMNITY apenas quando a ocorrencia e solene", () => {
    const rules = [
      rule({ functionId: F1, scope: StaffingScope.SOLEMNITY, requiredCount: 5 }),
    ];
    expect(resolveStaffing(SUNDAY_10H, rules).has(F1)).toBe(false);

    const solemn: OccurrenceDescriptor = { ...SUNDAY_10H, isSolemnity: true };
    expect(resolveStaffing(solemn, rules).get(F1)).toBe(5);
  });

  it("resolve escopo OCCASION quando a excecao casa", () => {
    const occasionOccurrence: OccurrenceDescriptor = {
      weekday: 3,
      scheduleId: null,
      exceptionId: "exc-festa",
      isSolemnity: false,
    };
    const rules = [
      rule({
        functionId: F1,
        scope: StaffingScope.OCCASION,
        massExceptionId: "exc-festa",
        requiredCount: 6,
      }),
    ];
    expect(resolveStaffing(occasionOccurrence, rules).get(F1)).toBe(6);
  });

  it("ignora OCCASION de outra excecao", () => {
    const rules = [
      rule({
        functionId: F1,
        scope: StaffingScope.OCCASION,
        massExceptionId: "exc-outra",
        requiredCount: 6,
      }),
    ];
    const occ: OccurrenceDescriptor = { ...SUNDAY_10H, exceptionId: "exc-festa" };
    expect(resolveStaffing(occ, rules).has(F1)).toBe(false);
  });

  // ── Desempate de prioridade (mais específico vence) — por função ──

  it("prioridade: OCCASION vence SOLEMNITY/SCHEDULE/WEEKDAY/DEFAULT", () => {
    const occ: OccurrenceDescriptor = {
      weekday: 0,
      scheduleId: "sched-10h",
      exceptionId: "exc-festa",
      isSolemnity: true,
    };
    const rules = [
      rule({ functionId: F1, scope: StaffingScope.DEFAULT, requiredCount: 1 }),
      rule({ functionId: F1, scope: StaffingScope.WEEKDAY, weekday: 0, requiredCount: 2 }),
      rule({ functionId: F1, scope: StaffingScope.SCHEDULE, massScheduleId: "sched-10h", requiredCount: 3 }),
      rule({ functionId: F1, scope: StaffingScope.SOLEMNITY, requiredCount: 4 }),
      rule({ functionId: F1, scope: StaffingScope.OCCASION, massExceptionId: "exc-festa", requiredCount: 9 }),
    ];
    expect(resolveStaffing(occ, rules).get(F1)).toBe(9);
  });

  it("prioridade: SOLEMNITY vence SCHEDULE/WEEKDAY/DEFAULT quando nao ha OCCASION", () => {
    const occ: OccurrenceDescriptor = {
      weekday: 0,
      scheduleId: "sched-10h",
      exceptionId: null,
      isSolemnity: true,
    };
    const rules = [
      rule({ functionId: F1, scope: StaffingScope.DEFAULT, requiredCount: 1 }),
      rule({ functionId: F1, scope: StaffingScope.WEEKDAY, weekday: 0, requiredCount: 2 }),
      rule({ functionId: F1, scope: StaffingScope.SCHEDULE, massScheduleId: "sched-10h", requiredCount: 3 }),
      rule({ functionId: F1, scope: StaffingScope.SOLEMNITY, requiredCount: 7 }),
    ];
    expect(resolveStaffing(occ, rules).get(F1)).toBe(7);
  });

  it("prioridade: SCHEDULE vence WEEKDAY vence DEFAULT", () => {
    const rules = [
      rule({ functionId: F1, scope: StaffingScope.DEFAULT, requiredCount: 1 }),
      rule({ functionId: F1, scope: StaffingScope.WEEKDAY, weekday: 0, requiredCount: 2 }),
      rule({ functionId: F1, scope: StaffingScope.SCHEDULE, massScheduleId: "sched-10h", requiredCount: 3 }),
    ];
    expect(resolveStaffing(SUNDAY_10H, rules).get(F1)).toBe(3);

    const noSchedule = rules.filter((r) => r.scope !== StaffingScope.SCHEDULE);
    expect(resolveStaffing(SUNDAY_10H, noSchedule).get(F1)).toBe(2);

    const onlyDefault = rules.filter((r) => r.scope === StaffingScope.DEFAULT);
    expect(resolveStaffing(SUNDAY_10H, onlyDefault).get(F1)).toBe(1);
  });

  it("resolve prioridade INDEPENDENTE por função", () => {
    const F2 = "func-2";
    const rules = [
      // F1: tem regra específica de horário + default
      rule({ functionId: F1, scope: StaffingScope.DEFAULT, requiredCount: 1 }),
      rule({ functionId: F1, scope: StaffingScope.SCHEDULE, massScheduleId: "sched-10h", requiredCount: 5 }),
      // F2: só default
      rule({ functionId: F2, scope: StaffingScope.DEFAULT, requiredCount: 2 }),
    ];
    const result = resolveStaffing(SUNDAY_10H, rules);
    expect(result.get(F1)).toBe(5);
    expect(result.get(F2)).toBe(2);
  });

  it("ignora regras inativas", () => {
    const rules = [
      rule({ functionId: F1, scope: StaffingScope.DEFAULT, requiredCount: 1 }),
      rule({ functionId: F1, scope: StaffingScope.SCHEDULE, massScheduleId: "sched-10h", requiredCount: 9, isActive: false }),
    ];
    expect(resolveStaffing(SUNDAY_10H, rules).get(F1)).toBe(1);
  });

  it("retorna Map vazio quando nenhuma regra casa", () => {
    const rules = [
      rule({ functionId: F1, scope: StaffingScope.WEEKDAY, weekday: 6, requiredCount: 3 }),
    ];
    expect(resolveStaffing(SUNDAY_10H, rules).size).toBe(0);
  });
});
