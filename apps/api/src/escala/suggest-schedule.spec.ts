import { StaffingScope } from "@missas/shared";
import {
  planSchedule,
  type PlanInput,
  type PlanTeam,
  type PlanOccurrence,
  type PlanExistingAssignment,
} from "./suggest-schedule";
import type { StaffingRule } from "./resolve-staffing";
import type { AvailabilityRuleInput } from "./resolve-availability";

// ── Builders de conveniência ──────────────────────────────

// Domingo (weekday=0). Datas em ordem crescente por string.
function occ(partial: Partial<PlanOccurrence> & { id: string }): PlanOccurrence {
  return {
    date: "2026-08-02",
    weekday: 0,
    time: "10:00",
    isSolemnity: false,
    scheduleId: "sched-10h",
    exceptionId: null,
    ...partial,
  };
}

function staffing(functionId: string, requiredCount: number): StaffingRule {
  return {
    functionId,
    requiredCount,
    scope: StaffingScope.DEFAULT,
    weekday: null,
    massScheduleId: null,
    massExceptionId: null,
    isActive: true,
  };
}

interface MemberSpec {
  memberId: string;
  functions: string[];
  priority?: number;
  cap?: number | null;
}

function team(partial: {
  id: string;
  name: string;
  functions: { id: string; name: string; sortOrder?: number }[];
  staffing: StaffingRule[];
  members: MemberSpec[];
}): PlanTeam {
  return {
    id: partial.id,
    name: partial.name,
    functions: partial.functions.map((f) => ({
      id: f.id,
      name: f.name,
      sortOrder: f.sortOrder ?? 0,
    })),
    staffing: partial.staffing,
    memberships: partial.members.map((m) => ({
      memberId: m.memberId,
      priority: m.priority ?? 100,
      maxAssignmentsPerMonth: m.cap === undefined ? null : m.cap,
      qualifiedFunctionIds: m.functions,
    })),
  };
}

// Marca o membro AVAILABLE via desvio explícito para uma ocorrência.
function available(
  entries: Map<string, { status: string }>,
  memberId: string,
  occurrenceId: string,
) {
  entries.set(`${memberId}|${occurrenceId}`, { status: "AVAILABLE" });
}

function baseInput(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    occurrences: [],
    teams: [],
    existing: [],
    entries: new Map(),
    rulesByMember: new Map(),
    ...overrides,
  };
}

const F1 = "func-1";
const F2 = "func-2";

describe("planSchedule (S7 — motor de sugestão)", () => {
  it("A2: sem membro qualificado -> lacuna SEM_QUALIFICADO", () => {
    const o = occ({ id: "o1" });
    const t = team({
      id: "t1",
      name: "Coroinhas",
      functions: [{ id: F1, name: "Cruz" }],
      staffing: [staffing(F1, 1)],
      members: [{ memberId: "m1", functions: [] }], // não qualificado p/ F1
    });
    const entries = new Map<string, { status: string }>();
    available(entries, "m1", "o1");

    const { toCreate, gaps } = planSchedule(
      baseInput({ occurrences: [o], teams: [t], entries }),
    );

    expect(toCreate).toHaveLength(0);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].reason).toBe("SEM_QUALIFICADO");
    expect(gaps[0].missing).toBe(1);
  });

  it("A1: quem 'não informou' (default) não é escalado -> SEM_DISPONIVEL", () => {
    const o = occ({ id: "o1" });
    const t = team({
      id: "t1",
      name: "Coroinhas",
      functions: [{ id: F1, name: "Cruz" }],
      staffing: [staffing(F1, 1)],
      members: [{ memberId: "m1", functions: [F1] }],
    });
    // Sem entry e sem regra → default (não informou) → indisponível.
    const { toCreate, gaps } = planSchedule(
      baseInput({ occurrences: [o], teams: [t] }),
    );

    expect(toCreate).toHaveLength(0);
    expect(gaps[0].reason).toBe("SEM_DISPONIVEL");
  });

  it("A1: disponibilidade por REGRA recorrente também escala", () => {
    const o = occ({ id: "o1", weekday: 0, time: "10:00" });
    const t = team({
      id: "t1",
      name: "Coroinhas",
      functions: [{ id: F1, name: "Cruz" }],
      staffing: [staffing(F1, 1)],
      members: [{ memberId: "m1", functions: [F1] }],
    });
    const rulesByMember = new Map<string, AvailabilityRuleInput[]>([
      ["m1", [{ weekday: 0, time: null, available: true }]],
    ]);

    const { toCreate, gaps } = planSchedule(
      baseInput({ occurrences: [o], teams: [t], rulesByMember }),
    );

    expect(gaps).toHaveLength(0);
    expect(toCreate).toEqual([
      { occurrenceId: "o1", teamId: "t1", functionId: F1, memberId: "m1" },
    ]);
  });

  it("escala normal: preenche a vaga com o membro qualificado e disponível", () => {
    const o = occ({ id: "o1" });
    const t = team({
      id: "t1",
      name: "Coroinhas",
      functions: [{ id: F1, name: "Cruz" }],
      staffing: [staffing(F1, 2)],
      members: [
        { memberId: "m1", functions: [F1] },
        { memberId: "m2", functions: [F1] },
      ],
    });
    const entries = new Map<string, { status: string }>();
    available(entries, "m1", "o1");
    available(entries, "m2", "o1");

    const { toCreate, gaps } = planSchedule(
      baseInput({ occurrences: [o], teams: [t], entries }),
    );

    expect(gaps).toHaveLength(0);
    expect(toCreate.map((a) => a.memberId).sort()).toEqual(["m1", "m2"]);
  });

  it("A4: o mesmo membro não é escalado duas vezes na mesma ocorrência", () => {
    // Duas funções, um só membro qualificado e disponível para ambas.
    const o = occ({ id: "o1" });
    const t = team({
      id: "t1",
      name: "Coroinhas",
      functions: [
        { id: F1, name: "Cruz", sortOrder: 0 },
        { id: F2, name: "Tocha", sortOrder: 1 },
      ],
      staffing: [staffing(F1, 1), staffing(F2, 1)],
      members: [{ memberId: "m1", functions: [F1, F2] }],
    });
    const entries = new Map<string, { status: string }>();
    available(entries, "m1", "o1");

    const { toCreate, gaps } = planSchedule(
      baseInput({ occurrences: [o], teams: [t], entries }),
    );

    // Entra só em F1 (ordem por sortOrder); F2 fica em aberto por exclusividade.
    expect(toCreate).toHaveLength(1);
    expect(toCreate[0].functionId).toBe(F1);
    const gapF2 = gaps.find((g) => g.functionId === F2);
    expect(gapF2?.reason).toBe("TODOS_NO_TETO");
  });

  it("A3: respeita o teto por equipe -> excedente vira TODOS_NO_TETO", () => {
    // Uma pessoa, teto 1, duas ocorrências que ela poderia servir.
    const o1 = occ({ id: "o1", date: "2026-08-02" });
    const o2 = occ({ id: "o2", date: "2026-08-09" });
    const t = team({
      id: "t1",
      name: "Coroinhas",
      functions: [{ id: F1, name: "Cruz" }],
      staffing: [staffing(F1, 1)],
      members: [{ memberId: "m1", functions: [F1], cap: 1 }],
    });
    const entries = new Map<string, { status: string }>();
    available(entries, "m1", "o1");
    available(entries, "m1", "o2");

    const { toCreate, gaps } = planSchedule(
      baseInput({ occurrences: [o1, o2], teams: [t], entries }),
    );

    // Serve só a primeira (teto=1); a segunda fica no teto.
    expect(toCreate).toHaveLength(1);
    expect(toCreate[0].occurrenceId).toBe("o1");
    const gap = gaps.find((g) => g.occurrenceId === "o2");
    expect(gap?.reason).toBe("TODOS_NO_TETO");
  });

  it("A5: não sobrescreve rascunho — existente conta e só a vaga vazia é preenchida", () => {
    const o = occ({ id: "o1" });
    const t = team({
      id: "t1",
      name: "Coroinhas",
      functions: [{ id: F1, name: "Cruz" }],
      staffing: [staffing(F1, 2)],
      members: [
        { memberId: "m1", functions: [F1] },
        { memberId: "m2", functions: [F1] },
      ],
    });
    const entries = new Map<string, { status: string }>();
    available(entries, "m1", "o1");
    available(entries, "m2", "o1");
    // m1 já está escalado (rascunho existente).
    const existing: PlanExistingAssignment[] = [
      { occurrenceId: "o1", teamId: "t1", functionId: F1, memberId: "m1" },
    ];

    const { toCreate, gaps } = planSchedule(
      baseInput({ occurrences: [o], teams: [t], existing, entries }),
    );

    expect(gaps).toHaveLength(0);
    // Só cria m2; m1 é preservado (não recriado).
    expect(toCreate).toEqual([
      { occurrenceId: "o1", teamId: "t1", functionId: F1, memberId: "m2" },
    ]);
  });

  it("J1: balanceia a carga — espalha entre os membros ao longo do mês", () => {
    // 3 ocorrências, 1 vaga cada, 2 membros sem teto e sempre disponíveis.
    const occs = [
      occ({ id: "o1", date: "2026-08-02" }),
      occ({ id: "o2", date: "2026-08-09" }),
      occ({ id: "o3", date: "2026-08-16" }),
    ];
    const t = team({
      id: "t1",
      name: "Coroinhas",
      functions: [{ id: F1, name: "Cruz" }],
      staffing: [staffing(F1, 1)],
      members: [
        { memberId: "m1", functions: [F1] },
        { memberId: "m2", functions: [F1] },
      ],
    });
    const entries = new Map<string, { status: string }>();
    for (const o of occs) {
      available(entries, "m1", o.id);
      available(entries, "m2", o.id);
    }

    const { toCreate } = planSchedule(
      baseInput({ occurrences: occs, teams: [t], entries }),
    );

    // Distribui 2/1 (não empilha tudo numa pessoa).
    const counts = new Map<string, number>();
    for (const a of toCreate) counts.set(a.memberId, (counts.get(a.memberId) ?? 0) + 1);
    expect(toCreate).toHaveLength(3);
    expect(counts.get("m1")).toBe(2);
    expect(counts.get("m2")).toBe(1);
  });

  it("J2: empate de carga desempata por priority (menor = mais forte)", () => {
    const o = occ({ id: "o1" });
    const t = team({
      id: "t1",
      name: "Coroinhas",
      functions: [{ id: F1, name: "Cruz" }],
      staffing: [staffing(F1, 1)],
      members: [
        { memberId: "m-b", functions: [F1], priority: 50 },
        { memberId: "m-a", functions: [F1], priority: 10 }, // prioridade mais forte
      ],
    });
    const entries = new Map<string, { status: string }>();
    available(entries, "m-a", "o1");
    available(entries, "m-b", "o1");

    const { toCreate } = planSchedule(
      baseInput({ occurrences: [o], teams: [t], entries }),
    );

    // Mesmo com id "m-a" < "m-b", a escolha é por priority; aqui coincide, então
    // trocamos: priority manda antes do id.
    expect(toCreate[0].memberId).toBe("m-a");
  });

  it("J4: determinístico — a saída independe da ordem de entrada", () => {
    const occsA = [
      occ({ id: "o1", date: "2026-08-02" }),
      occ({ id: "o2", date: "2026-08-09" }),
    ];
    const membersA: MemberSpec[] = [
      { memberId: "m1", functions: [F1] },
      { memberId: "m2", functions: [F1] },
    ];
    const build = (occOrder: PlanOccurrence[], mem: MemberSpec[]) => {
      const t = team({
        id: "t1",
        name: "Coroinhas",
        functions: [{ id: F1, name: "Cruz" }],
        staffing: [staffing(F1, 1)],
        members: mem,
      });
      const entries = new Map<string, { status: string }>();
      for (const o of occOrder) {
        available(entries, "m1", o.id);
        available(entries, "m2", o.id);
      }
      return planSchedule(baseInput({ occurrences: occOrder, teams: [t], entries }));
    };

    const r1 = build(occsA, membersA);
    const r2 = build([...occsA].reverse(), [...membersA].reverse());

    expect(r1.toCreate).toEqual(r2.toCreate);
  });

  it("J3: não relaxa — deixa a lacuna quando nenhuma regra casa", () => {
    // Demanda 2, mas só 1 disponível-qualificado sem teto.
    const o = occ({ id: "o1" });
    const t = team({
      id: "t1",
      name: "Coroinhas",
      functions: [{ id: F1, name: "Cruz" }],
      staffing: [staffing(F1, 2)],
      members: [
        { memberId: "m1", functions: [F1] },
        { memberId: "m2", functions: [F1] }, // qualificado mas indisponível
      ],
    });
    const entries = new Map<string, { status: string }>();
    available(entries, "m1", "o1"); // só m1 disponível

    const { toCreate, gaps } = planSchedule(
      baseInput({ occurrences: [o], teams: [t], entries }),
    );

    expect(toCreate).toHaveLength(1);
    expect(toCreate[0].memberId).toBe("m1");
    const gap = gaps[0];
    expect(gap.missing).toBe(1);
    expect(gap.filled).toBe(1);
    expect(gap.required).toBe(2);
    // Havia qualificados, mas os que faltaram não estavam disponíveis.
    expect(gap.reason).toBe("SEM_DISPONIVEL");
  });

  it("demanda por escopo (D6): SOLEMNITY eleva o requiredCount da ocorrência", () => {
    const solemn = occ({ id: "o1", isSolemnity: true });
    const staffingRules: StaffingRule[] = [
      staffing(F1, 1),
      {
        functionId: F1,
        requiredCount: 3,
        scope: StaffingScope.SOLEMNITY,
        weekday: null,
        massScheduleId: null,
        massExceptionId: null,
        isActive: true,
      },
    ];
    const t = team({
      id: "t1",
      name: "Coroinhas",
      functions: [{ id: F1, name: "Cruz" }],
      staffing: staffingRules,
      members: [
        { memberId: "m1", functions: [F1] },
        { memberId: "m2", functions: [F1] },
        { memberId: "m3", functions: [F1] },
      ],
    });
    const entries = new Map<string, { status: string }>();
    available(entries, "m1", "o1");
    available(entries, "m2", "o1");
    available(entries, "m3", "o1");

    const { toCreate } = planSchedule(
      baseInput({ occurrences: [solemn], teams: [t], entries }),
    );

    // SOLEMNITY vence DEFAULT (3 > 1).
    expect(toCreate).toHaveLength(3);
  });

  it("A4 global: já escalado em OUTRA equipe na mesma ocorrência exclui a pessoa", () => {
    const o = occ({ id: "o1" });
    const t = team({
      id: "t1",
      name: "Coroinhas",
      functions: [{ id: F1, name: "Cruz" }],
      staffing: [staffing(F1, 1)],
      members: [{ memberId: "m1", functions: [F1] }],
    });
    const entries = new Map<string, { status: string }>();
    available(entries, "m1", "o1");
    // m1 já está numa outra equipe (t2) nessa ocorrência.
    const existing: PlanExistingAssignment[] = [
      { occurrenceId: "o1", teamId: "t2", functionId: "outra", memberId: "m1" },
    ];

    const { toCreate, gaps } = planSchedule(
      baseInput({ occurrences: [o], teams: [t], existing, entries }),
    );

    expect(toCreate).toHaveLength(0);
    expect(gaps[0].reason).toBe("TODOS_NO_TETO");
  });
});
