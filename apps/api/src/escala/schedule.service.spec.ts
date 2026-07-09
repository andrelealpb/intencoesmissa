import { Test, TestingModule } from "@nestjs/testing";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ScheduleService } from "./schedule.service";
import { EscalaAccessService, type EscalaActor } from "./escala-access.service";
import { PrismaService } from "../prisma/prisma.service";

const ADMIN: EscalaActor = {
  kind: "admin",
  userId: "u1",
  role: "PARISH_ADMIN",
  parishId: "p1",
};
const COORD: EscalaActor = { kind: "member", memberId: "mem1", parishId: "p1" };

const OCC = { id: "o1", date: new Date(Date.UTC(2026, 7, 2)), time: "10:00" };

const mockPrisma = {
  team: { findFirst: jest.fn(), findUnique: jest.fn() },
  teamFunction: { findUnique: jest.fn() },
  massOccurrence: { findMany: jest.fn(), findFirst: jest.fn() },
  member: { findFirst: jest.fn() },
  teamMembership: { findFirst: jest.fn() },
  assignment: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    updateMany: jest.fn(),
  },
  availabilityEntry: { findMany: jest.fn(), findFirst: jest.fn() },
  memberAvailabilityRule: { findMany: jest.fn() },
  $transaction: jest.fn(),
};

describe("ScheduleService", () => {
  let service: ScheduleService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleService,
        EscalaAccessService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(ScheduleService);

    // Defaults: t1 é de p1 (admin passa em assertCanManageTeam).
    mockPrisma.team.findUnique.mockResolvedValue({ parishId: "p1" });
    mockPrisma.teamMembership.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation((ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ── getGrid ──────────────────────────────────────────
  describe("getGrid", () => {
    it("coordenador em equipe alheia → 403", async () => {
      mockPrisma.teamMembership.findFirst.mockResolvedValue(null); // não coordena
      await expect(
        service.getGrid(COORD, { month: "2026-08", teamId: "t1" }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("mês não materializado → grade vazia, sem publicação", async () => {
      mockPrisma.team.findFirst.mockResolvedValue({
        id: "t1",
        name: "Coroinhas",
        functions: [],
        staffing: [],
        memberships: [],
      });
      mockPrisma.massOccurrence.findMany.mockResolvedValue([]);
      const grid = await service.getGrid(ADMIN, { month: "2026-08", teamId: "t1" });
      expect(grid.occurrences).toEqual([]);
      expect(grid.publication).toEqual({
        publishedAt: null,
        published: false,
        hasUnpublishedChanges: false,
      });
    });

    it("monta a grade e reporta mudança pós-publicação (rascunho sobre publicado)", async () => {
      const F1 = "f1";
      mockPrisma.team.findFirst.mockResolvedValue({
        id: "t1",
        name: "Coroinhas",
        functions: [{ id: F1, name: "Cruz", sortOrder: 0 }],
        staffing: [
          {
            functionId: F1,
            requiredCount: 2,
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
            member: { fullName: "Ana Alves" },
            qualifications: [{ functionId: F1 }],
          },
        ],
      });
      mockPrisma.massOccurrence.findMany.mockResolvedValue([
        { id: "o1", date: OCC.date, time: "10:00", isSolemnity: false, sourceScheduleId: "s10", sourceExceptionId: null },
      ]);
      const seal = new Date(Date.UTC(2026, 6, 20));
      mockPrisma.assignment.findMany.mockResolvedValue([
        // publicada
        {
          id: "a1", occurrenceId: "o1", teamId: "t1", functionId: F1, memberId: "m1",
          status: "SCHEDULED", publishedAt: seal, republishedAt: seal, overrideReason: null,
          team: { name: "Coroinhas" }, function: { name: "Cruz" }, member: { fullName: "Ana Alves" },
        },
        // rascunho novo sobre a publicada (mudança pós-publicação)
        {
          id: "a2", occurrenceId: "o1", teamId: "t1", functionId: F1, memberId: "m2",
          status: "SCHEDULED", publishedAt: null, republishedAt: null, overrideReason: null,
          team: { name: "Coroinhas" }, function: { name: "Cruz" }, member: { fullName: "Bia" },
        },
      ]);
      mockPrisma.availabilityEntry.findMany.mockResolvedValue([]);
      mockPrisma.memberAvailabilityRule.findMany.mockResolvedValue([]);

      const grid = await service.getGrid(ADMIN, { month: "2026-08", teamId: "t1" });
      expect(grid.publication.published).toBe(true);
      expect(grid.publication.hasUnpublishedChanges).toBe(true);
      expect(grid.publication.publishedAt).toBe(seal.toISOString());
      const slot = grid.occurrences[0].slots[0];
      expect(slot.filled).toBe(2);
      expect(slot.missing).toBe(0);
    });

    it("recusa (DECLINED) reabre a vaga e sinaliza mudança pós-publicação (S9/L4)", async () => {
      const F1 = "f1";
      mockPrisma.team.findFirst.mockResolvedValue({
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
            member: { fullName: "Ana Alves" },
            qualifications: [{ functionId: F1 }],
          },
        ],
      });
      mockPrisma.massOccurrence.findMany.mockResolvedValue([
        { id: "o1", date: OCC.date, time: "10:00", isSolemnity: false, sourceScheduleId: "s10", sourceExceptionId: null },
      ]);
      const seal = new Date(Date.UTC(2026, 6, 20));
      mockPrisma.assignment.findMany.mockResolvedValue([
        // publicada, porém RECUSADA pelo membro no portal (S9)
        {
          id: "a1", occurrenceId: "o1", teamId: "t1", functionId: F1, memberId: "m1",
          status: "DECLINED", publishedAt: seal, republishedAt: seal, overrideReason: null,
          team: { name: "Coroinhas" }, function: { name: "Cruz" }, member: { fullName: "Ana Alves" },
        },
      ]);
      mockPrisma.availabilityEntry.findMany.mockResolvedValue([]);
      mockPrisma.memberAvailabilityRule.findMany.mockResolvedValue([]);

      const grid = await service.getGrid(ADMIN, { month: "2026-08", teamId: "t1" });
      const slot = grid.occurrences[0].slots[0];
      // A vaga voltou a contar como aberta (DECLINED não ocupa).
      expect(slot.filled).toBe(0);
      expect(slot.missing).toBe(1);
      // O marcador da S8 é reusado para sinalizar a mudança ao coordenador.
      expect(grid.publication.published).toBe(true);
      expect(grid.publication.hasUnpublishedChanges).toBe(true);
    });
  });

  // ── createAssignment ─────────────────────────────────
  function setupCreate(overrides: Record<string, unknown> = {}) {
    mockPrisma.teamFunction.findUnique.mockResolvedValue({
      id: "f1", teamId: "t1", isActive: true, team: { parishId: "p1" },
    });
    mockPrisma.massOccurrence.findFirst.mockResolvedValue(OCC);
    mockPrisma.member.findFirst.mockResolvedValue({ id: "m1", isActive: true });
    mockPrisma.assignment.findFirst.mockResolvedValue(null); // sem clash
    mockPrisma.teamMembership.findFirst.mockImplementation((args: { where?: { isCoordinator?: boolean } }) => {
      // Chamada do EscalaAccessService (coordenador) vs. a de qualificação.
      if (args?.where?.isCoordinator) return Promise.resolve({ id: "coord" });
      return Promise.resolve({ maxAssignmentsPerMonth: null, qualifications: [{ functionId: "f1" }] });
    });
    mockPrisma.availabilityEntry.findFirst.mockResolvedValue({ status: "AVAILABLE" });
    mockPrisma.memberAvailabilityRule.findMany.mockResolvedValue([]);
    mockPrisma.assignment.count.mockResolvedValue(0);
    mockPrisma.assignment.create.mockResolvedValue({ id: "new", overrideReason: null, publishedAt: null });
    Object.assign(mockPrisma, overrides);
  }

  const BODY = { occurrenceId: "o1", functionId: "f1", memberId: "m1" };

  it("cria atribuição de membro elegível como rascunho (publishedAt=null)", async () => {
    setupCreate();
    await service.createAssignment(ADMIN, BODY);
    const arg = mockPrisma.assignment.create.mock.calls[0][0];
    expect(arg.data).toMatchObject({
      parishId: "p1", teamId: "t1", functionId: "f1", memberId: "m1",
      status: "SCHEDULED", publishedAt: null, overrideReason: null, assignedByUserId: "u1",
    });
  });

  it("V3: membro já escalado na ocorrência → 409 claro (sem criar)", async () => {
    setupCreate();
    mockPrisma.assignment.findFirst.mockResolvedValue({ id: "x", team: { name: "MESC" } });
    await expect(service.createAssignment(ADMIN, BODY)).rejects.toThrow(ConflictException);
    expect(mockPrisma.assignment.create).not.toHaveBeenCalled();
  });

  it("V2: indisponível sem overrideReason → 422 (sem criar)", async () => {
    setupCreate();
    mockPrisma.availabilityEntry.findFirst.mockResolvedValue(null); // não informou → indisponível
    await expect(service.createAssignment(ADMIN, BODY)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(mockPrisma.assignment.create).not.toHaveBeenCalled();
  });

  it("V2: indisponível COM overrideReason → cria com a justificativa", async () => {
    setupCreate();
    mockPrisma.availabilityEntry.findFirst.mockResolvedValue(null);
    await service.createAssignment(ADMIN, { ...BODY, overrideReason: "Confirmou por telefone" });
    const arg = mockPrisma.assignment.create.mock.calls[0][0];
    expect(arg.data.overrideReason).toBe("Confirmou por telefone");
  });

  it("V2: não qualificado sem override → 422", async () => {
    setupCreate();
    mockPrisma.teamMembership.findFirst.mockImplementation((args: { where?: { isCoordinator?: boolean } }) => {
      if (args?.where?.isCoordinator) return Promise.resolve({ id: "coord" });
      return Promise.resolve({ maxAssignmentsPerMonth: null, qualifications: [] }); // não qualificado
    });
    await expect(service.createAssignment(ADMIN, BODY)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it("função de outra paróquia → 404", async () => {
    setupCreate();
    mockPrisma.teamFunction.findUnique.mockResolvedValue({
      id: "f1", teamId: "t1", isActive: true, team: { parishId: "outra" },
    });
    await expect(service.createAssignment(ADMIN, BODY)).rejects.toThrow(NotFoundException);
  });

  // ── deleteAssignment ─────────────────────────────────
  it("delete: atribuição de outra paróquia → 404", async () => {
    mockPrisma.assignment.findUnique.mockResolvedValue({ id: "a1", parishId: "outra", teamId: "t1" });
    await expect(service.deleteAssignment(ADMIN, "a1")).rejects.toThrow(NotFoundException);
    expect(mockPrisma.assignment.delete).not.toHaveBeenCalled();
  });

  it("delete: remove atribuição autorizada", async () => {
    mockPrisma.assignment.findUnique.mockResolvedValue({ id: "a1", parishId: "p1", teamId: "t1" });
    mockPrisma.assignment.delete.mockResolvedValue({});
    const res = await service.deleteAssignment(ADMIN, "a1");
    expect(res).toEqual({ deleted: true });
    expect(mockPrisma.assignment.delete).toHaveBeenCalledWith({ where: { id: "a1" } });
  });

  // ── publish ──────────────────────────────────────────
  it("publish: coordenador em equipe alheia → 403", async () => {
    mockPrisma.teamMembership.findFirst.mockResolvedValue(null);
    await expect(
      service.publish(COORD, { month: "2026-08", teamId: "t1" }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("publish: carimba rascunhos e re-sela publicados", async () => {
    mockPrisma.assignment.updateMany
      .mockResolvedValueOnce({ count: 3 }) // rascunhos → publicados
      .mockResolvedValueOnce({ count: 1 }); // já publicados → re-selados
    const res = await service.publish(ADMIN, { month: "2026-08", teamId: "t1" });
    expect(res.published).toBe(3);
    expect(res.resealed).toBe(1);
    expect(res.publishedAt).not.toBeNull();
    // primeira updateMany filtra publishedAt=null e seta ambos.
    const first = mockPrisma.assignment.updateMany.mock.calls[0][0];
    expect(first.where.publishedAt).toBeNull();
    expect(first.data).toHaveProperty("publishedAt");
    expect(first.data).toHaveProperty("republishedAt");
  });
});
