import {
  buildScheduleGrid,
  type GridInput,
  type GridTeam,
  type GridExistingAssignment,
} from "./schedule-grid";
import type { PlanOccurrence } from "./suggest-schedule";

const F1 = "func-cruz";
const F2 = "func-turibulo";

// Domingo 2026-08-02, 10h.
const OCC: PlanOccurrence = {
  id: "o1",
  date: "2026-08-02",
  weekday: 0,
  time: "10:00",
  isSolemnity: false,
  scheduleId: "sched-10h",
  exceptionId: null,
};

function team(overrides: Partial<GridTeam> = {}): GridTeam {
  return {
    id: "t1",
    name: "Coroinhas",
    functions: [
      { id: F1, name: "Cruz", sortOrder: 0 },
      { id: F2, name: "Turibulo", sortOrder: 1 },
    ],
    staffing: [
      {
        functionId: F1,
        requiredCount: 1,
        scope: "DEFAULT" as never,
        weekday: null,
        massScheduleId: null,
        massExceptionId: null,
        isActive: true,
      },
    ],
    memberships: [
      {
        memberId: "m1",
        memberName: "Ana Alves",
        maxAssignmentsPerMonth: null,
        qualifiedFunctionIds: [F1],
      },
    ],
    ...overrides,
  };
}

function build(input: Partial<GridInput> & { team: GridTeam }): GridInput {
  return {
    occurrences: [OCC],
    existing: [],
    entries: new Map(),
    rulesByMember: new Map(),
    ...input,
  };
}

// Disponibilidade explícita AVAILABLE de um membro na ocorrência.
function available(memberId: string, status = "AVAILABLE") {
  return new Map<string, { status: string }>([[`${memberId}|o1`, { status }]]);
}

describe("buildScheduleGrid", () => {
  it("monta a vaga com o candidato elegível quando disponível e qualificado", () => {
    const grid = buildScheduleGrid(
      build({ team: team(), entries: available("m1") }),
    );
    expect(grid.occurrences).toHaveLength(1);
    const slot = grid.occurrences[0].slots[0];
    expect(slot.functionName).toBe("Cruz");
    expect(slot.required).toBe(1);
    expect(slot.filled).toBe(0);
    expect(slot.missing).toBe(1);
    expect(slot.gap).toBeNull(); // preenchível — há elegível
    expect(slot.candidates).toHaveLength(1);
    expect(slot.candidates[0]).toMatchObject({
      memberId: "m1",
      eligible: true,
      reason: null,
      available: true,
      conflict: null,
    });
  });

  it("A1: quem não informou disponibilidade fica INDISPONIVEL e a lacuna vira SEM_DISPONIVEL", () => {
    const grid = buildScheduleGrid(build({ team: team(), entries: new Map() }));
    const slot = grid.occurrences[0].slots[0];
    expect(slot.candidates[0]).toMatchObject({
      eligible: false,
      reason: "INDISPONIVEL",
      availabilitySource: "default",
    });
    expect(slot.gap).toBe("SEM_DISPONIVEL");
  });

  it("SEM_QUALIFICADO quando ninguém tem a função", () => {
    const t = team({ memberships: [] });
    const grid = buildScheduleGrid(build({ team: t }));
    const slot = grid.occurrences[0].slots[0];
    expect(slot.candidates).toHaveLength(0);
    expect(slot.gap).toBe("SEM_QUALIFICADO");
  });

  it("A3: teto por equipe atingido → NO_TETO e lacuna TODOS_NO_TETO", () => {
    const t = team({
      memberships: [
        { memberId: "m1", memberName: "Ana Alves", maxAssignmentsPerMonth: 1, qualifiedFunctionIds: [F1] },
      ],
    });
    // m1 já tem 1 atribuição na equipe (em outra ocorrência) → no teto.
    const existing: GridExistingAssignment[] = [
      {
        assignmentId: "a-prev",
        occurrenceId: "o0",
        teamId: "t1",
        teamName: "Coroinhas",
        functionId: F1,
        functionName: "Cruz",
        memberId: "m1",
        memberName: "Ana Alves",
        status: "SCHEDULED",
        published: false,
        overrideReason: null,
      },
    ];
    const grid = buildScheduleGrid(build({ team: t, existing, entries: available("m1") }));
    const slot = grid.occurrences[0].slots[0];
    expect(slot.candidates[0]).toMatchObject({
      eligible: false,
      reason: "NO_TETO",
      atCap: true,
      assignmentsInTeamMonth: 1,
    });
    expect(slot.gap).toBe("TODOS_NO_TETO");
  });

  it("V3/A4: já escalado nesta ocorrência por OUTRA equipe → JA_NA_OCORRENCIA + conflict", () => {
    const existing: GridExistingAssignment[] = [
      {
        assignmentId: "a-mesc",
        occurrenceId: "o1",
        teamId: "t-mesc",
        teamName: "MESC",
        functionId: "f-mesc",
        functionName: "Ministro",
        memberId: "m1",
        memberName: "Ana Alves",
        status: "SCHEDULED",
        published: true,
        overrideReason: null,
      },
    ];
    const grid = buildScheduleGrid(build({ team: team(), existing, entries: available("m1") }));
    const cand = grid.occurrences[0].slots[0].candidates[0];
    expect(cand).toMatchObject({
      eligible: false,
      reason: "JA_NA_OCORRENCIA",
      alreadyInOccurrence: true,
    });
    expect(cand.conflict).toEqual({
      teamId: "t-mesc",
      teamName: "MESC",
      functionId: "f-mesc",
      functionName: "Ministro",
    });
  });

  it("vaga preenchida: assignment listado, membro fora dos candidatos, missing 0, sem gap", () => {
    const existing: GridExistingAssignment[] = [
      {
        assignmentId: "a1",
        occurrenceId: "o1",
        teamId: "t1",
        teamName: "Coroinhas",
        functionId: F1,
        functionName: "Cruz",
        memberId: "m1",
        memberName: "Ana Alves",
        status: "SCHEDULED",
        published: true,
        overrideReason: "forcei",
      },
    ];
    const grid = buildScheduleGrid(build({ team: team(), existing, entries: available("m1") }));
    const slot = grid.occurrences[0].slots[0];
    expect(slot.filled).toBe(1);
    expect(slot.missing).toBe(0);
    expect(slot.gap).toBeNull();
    expect(slot.assignments).toEqual([
      {
        assignmentId: "a1",
        memberId: "m1",
        memberName: "Ana Alves",
        status: "SCHEDULED",
        published: true,
        overrideReason: "forcei",
      },
    ]);
    // m1 não reaparece como candidato para a mesma vaga.
    expect(slot.candidates).toHaveLength(0);
  });

  it("ordena elegíveis primeiro (por menor carga) e excluídos depois", () => {
    const t = team({
      memberships: [
        { memberId: "m1", memberName: "Ana", maxAssignmentsPerMonth: null, qualifiedFunctionIds: [F1] },
        { memberId: "m2", memberName: "Bia", maxAssignmentsPerMonth: null, qualifiedFunctionIds: [F1] },
        { memberId: "m3", memberName: "Cida", maxAssignmentsPerMonth: null, qualifiedFunctionIds: [F1] },
      ],
    });
    // m1 disponível com 1 carga; m2 disponível com 0 carga; m3 indisponível.
    const existing: GridExistingAssignment[] = [
      {
        assignmentId: "a-prev",
        occurrenceId: "o0",
        teamId: "t1",
        teamName: "Coroinhas",
        functionId: F1,
        functionName: "Cruz",
        memberId: "m1",
        memberName: "Ana",
        status: "SCHEDULED",
        published: false,
        overrideReason: null,
      },
    ];
    const entries = new Map<string, { status: string }>([
      ["m1|o1", { status: "AVAILABLE" }],
      ["m2|o1", { status: "AVAILABLE" }],
    ]);
    const grid = buildScheduleGrid(build({ team: t, existing, entries }));
    const cands = grid.occurrences[0].slots[0].candidates;
    // m2 (elegível, carga 0) → m1 (elegível, carga 1) → m3 (excluído).
    expect(cands.map((c) => c.memberId)).toEqual(["m2", "m1", "m3"]);
    expect(cands[0].eligible).toBe(true);
    expect(cands[2].eligible).toBe(false);
  });

  it("só cria slots para funções com demanda (resolveStaffing/D6)", () => {
    // Staffing só tem F1; F2 não tem demanda → sem slot.
    const grid = buildScheduleGrid(build({ team: team(), entries: available("m1") }));
    const slots = grid.occurrences[0].slots;
    expect(slots).toHaveLength(1);
    expect(slots[0].functionId).toBe(F1);
  });
});
