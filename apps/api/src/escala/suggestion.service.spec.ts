import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { SuggestionService } from "./suggestion.service";
import { EscalaAccessService, type EscalaActor } from "./escala-access.service";
import { PrismaService } from "../prisma/prisma.service";

const F1 = "func-1";

// Ocorrência de domingo materializada.
const OCC = {
  id: "o1",
  date: new Date(Date.UTC(2026, 7, 2)), // 2026-08-02
  time: "10:00",
  isSolemnity: false,
  sourceScheduleId: "sched-10h",
  sourceExceptionId: null,
};

// Equipe t1 (paróquia p1) com uma função e um membro qualificado.
const TEAM_T1 = {
  id: "t1",
  name: "Coroinhas",
  functions: [{ id: F1, name: "Cruz", sortOrder: 0 }],
  staffing: [
    {
      functionId: F1,
      requiredCount: 1,
      scope: "DEFAULT",
      weekday: null,
      massScheduleId: null,
      massExceptionId: null,
      isActive: true,
    },
  ],
  memberships: [
    {
      memberId: "m1",
      maxAssignmentsPerMonth: null,
      qualifications: [{ functionId: F1 }],
    },
  ],
};

const ADMIN: EscalaActor = {
  kind: "admin",
  userId: "u1",
  role: "PARISH_ADMIN",
  parishId: "p1",
};

const COORD: EscalaActor = {
  kind: "member",
  memberId: "mem1",
  parishId: "p1",
};

const mockPrisma = {
  massOccurrence: { findMany: jest.fn() },
  team: { findUnique: jest.fn(), findMany: jest.fn() },
  teamMembership: { findFirst: jest.fn(), findMany: jest.fn() },
  assignment: { findMany: jest.fn(), createMany: jest.fn() },
  availabilityEntry: { findMany: jest.fn() },
  memberAvailabilityRule: { findMany: jest.fn() },
};

// Atribuições vivas no mês (in-month) e histórico anterior ao mês (J2).
// A consulta de histórico é distinguida por `where.occurrence.date.lt`.
let inMonthAssignments: unknown[] = [];
let historyAssignments: unknown[] = [];

describe("SuggestionService", () => {
  let service: SuggestionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuggestionService,
        EscalaAccessService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<SuggestionService>(SuggestionService);

    inMonthAssignments = [];
    historyAssignments = [];

    // Padrões: t1 é de p1; sem atribuições/regras; m1 disponível na o1.
    mockPrisma.team.findUnique.mockResolvedValue({ parishId: "p1" });
    mockPrisma.team.findMany.mockResolvedValue([TEAM_T1]);
    mockPrisma.massOccurrence.findMany.mockResolvedValue([OCC]);
    mockPrisma.assignment.findMany.mockImplementation((args: { where?: { occurrence?: { date?: { lt?: unknown } } } }) => {
      // Consulta do histórico (J2): filtra por occurrence.date < início do mês.
      if (args?.where?.occurrence?.date?.lt) {
        return Promise.resolve(historyAssignments);
      }
      return Promise.resolve(inMonthAssignments);
    });
    mockPrisma.assignment.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.availabilityEntry.findMany.mockResolvedValue([
      { memberId: "m1", occurrenceId: "o1", status: "AVAILABLE" },
    ]);
    mockPrisma.memberAvailabilityRule.findMany.mockResolvedValue([]);
    mockPrisma.teamMembership.findMany.mockResolvedValue([{ teamId: "t1" }]);
  });

  afterEach(() => jest.clearAllMocks());

  it("rejeita mês não materializado com mensagem clara (400)", async () => {
    mockPrisma.massOccurrence.findMany.mockResolvedValue([]);
    await expect(
      service.suggest(ADMIN, { month: "2026-08", teamIds: ["t1"] }),
    ).rejects.toThrow(BadRequestException);
    expect(mockPrisma.assignment.createMany).not.toHaveBeenCalled();
  });

  it("admin: cria rascunho (publishedAt=null, SCHEDULED) e retorna created/gaps", async () => {
    const result = await service.suggest(ADMIN, {
      month: "2026-08",
      teamIds: ["t1"],
    });

    expect(result.created).toBe(1);
    expect(result.gaps).toHaveLength(0);
    expect(mockPrisma.assignment.createMany).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.assignment.createMany.mock.calls[0][0];
    expect(arg.data).toEqual([
      {
        parishId: "p1",
        occurrenceId: "o1",
        teamId: "t1",
        functionId: F1,
        memberId: "m1",
        status: "SCHEDULED",
        publishedAt: null,
        assignedByUserId: "u1",
        assignedByMemberId: null,
      },
    ]);
  });

  it("coordenador em equipe alheia -> 403 (não persiste nada)", async () => {
    // Não coordena t1 → assertCanManageTeam lança 403.
    mockPrisma.teamMembership.findFirst.mockResolvedValue(null);
    await expect(
      service.suggest(COORD, { month: "2026-08", teamIds: ["t1"] }),
    ).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.assignment.createMany).not.toHaveBeenCalled();
  });

  it("coordenador: assignedByMemberId preenchido no rascunho", async () => {
    mockPrisma.teamMembership.findFirst.mockResolvedValue({ id: "ms1" });
    await service.suggest(COORD, { month: "2026-08", teamIds: ["t1"] });
    const arg = mockPrisma.assignment.createMany.mock.calls[0][0];
    expect(arg.data[0].assignedByMemberId).toBe("mem1");
    expect(arg.data[0].assignedByUserId).toBeNull();
  });

  it("A5: vaga já preenchida não é recriada (created=0, sem gap)", async () => {
    inMonthAssignments = [
      { occurrenceId: "o1", teamId: "t1", functionId: F1, memberId: "m1" },
    ];
    const result = await service.suggest(ADMIN, {
      month: "2026-08",
      teamIds: ["t1"],
    });
    expect(result.created).toBe(0);
    expect(result.gaps).toHaveLength(0);
    expect(mockPrisma.assignment.createMany).not.toHaveBeenCalled();
  });

  it("sem teamIds, admin usa todas as equipes ativas da paróquia", async () => {
    mockPrisma.team.findMany
      .mockResolvedValueOnce([{ id: "t1" }]) // resolveTeamIds (default admin)
      .mockResolvedValueOnce([TEAM_T1]); // carga das equipes
    const result = await service.suggest(ADMIN, { month: "2026-08" });
    expect(result.created).toBe(1);
    // Primeira chamada filtra por isActive (conjunto padrão).
    const firstCall = mockPrisma.team.findMany.mock.calls[0][0];
    expect(firstCall.where).toMatchObject({ parishId: "p1", isActive: true });
  });

  it("coordenador sem equipes -> created 0, sem persistir", async () => {
    mockPrisma.teamMembership.findMany.mockResolvedValue([]);
    const result = await service.suggest(COORD, { month: "2026-08" });
    expect(result).toEqual({ created: 0, gaps: [] });
    expect(mockPrisma.assignment.createMany).not.toHaveBeenCalled();
  });

  it("J2: carrega o histórico anterior ao mês e escala quem serviu há mais tempo", async () => {
    // Dois membros qualificados/disponíveis; m2 serviu há mais tempo que m1.
    mockPrisma.team.findMany.mockResolvedValue([
      {
        ...TEAM_T1,
        memberships: [
          { memberId: "m1", maxAssignmentsPerMonth: null, qualifications: [{ functionId: F1 }] },
          { memberId: "m2", maxAssignmentsPerMonth: null, qualifications: [{ functionId: F1 }] },
        ],
      },
    ]);
    mockPrisma.availabilityEntry.findMany.mockResolvedValue([
      { memberId: "m1", occurrenceId: "o1", status: "AVAILABLE" },
      { memberId: "m2", occurrenceId: "o1", status: "AVAILABLE" },
    ]);
    historyAssignments = [
      { memberId: "m1", occurrence: { date: new Date(Date.UTC(2026, 6, 25)) } }, // 2026-07-25 (recente)
      { memberId: "m2", occurrence: { date: new Date(Date.UTC(2026, 5, 1)) } }, // 2026-06-01 (há mais tempo)
    ];

    await service.suggest(ADMIN, { month: "2026-08", teamIds: ["t1"] });

    // A consulta de histórico foi feita (where.occurrence.date.lt = início do mês).
    const historyCall = mockPrisma.assignment.findMany.mock.calls.find(
      (c) => c[0]?.where?.occurrence?.date?.lt,
    );
    expect(historyCall).toBeDefined();
    // Só 1 vaga → escala m2 (serviu há mais tempo), não m1.
    const arg = mockPrisma.assignment.createMany.mock.calls[0][0];
    expect(arg.data).toHaveLength(1);
    expect(arg.data[0].memberId).toBe("m2");
  });

  it("gap SEM_DISPONIVEL quando o membro não informou disponibilidade", async () => {
    mockPrisma.availabilityEntry.findMany.mockResolvedValue([]); // ninguém marcou
    const result = await service.suggest(ADMIN, {
      month: "2026-08",
      teamIds: ["t1"],
    });
    expect(result.created).toBe(0);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].reason).toBe("SEM_DISPONIVEL");
    expect(result.gaps[0].functionName).toBe("Cruz");
  });
});
