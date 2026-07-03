import { Test, TestingModule } from "@nestjs/testing";
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { MinistryCategory } from "@missas/shared";
import { CadastroService } from "./cadastro.service";
import { EscalaAccessService, type AdminActor } from "./escala-access.service";
import { PrismaService } from "../prisma/prisma.service";

const mockPrisma = {
  team: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  teamFunction: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  member: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  teamMembership: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  membershipFunction: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
    count: jest.fn(),
  },
  staffingRequirement: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  assignment: { count: jest.fn() },
  massSchedule: { findUnique: jest.fn() },
  massException: { findUnique: jest.fn() },
  $transaction: jest.fn((ops: unknown[]) =>
    Promise.all(ops as Promise<unknown>[]),
  ),
};

const ADMIN: AdminActor = {
  kind: "admin",
  userId: "u1",
  role: "PARISH_ADMIN",
  parishId: "p1",
};

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint", {
    code: "P2002",
    clientVersion: "5.22.0",
  });
}

describe("CadastroService", () => {
  let service: CadastroService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CadastroService,
        EscalaAccessService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<CadastroService>(CadastroService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── Autorização / ownership ───────────────────────────

  describe("authorization", () => {
    it("nega ator sem role PARISH_ADMIN (Forbidden)", async () => {
      const intruder: AdminActor = {
        kind: "admin",
        userId: "x",
        role: "OTHER",
        parishId: "p1",
      };
      await expect(service.listTeams(intruder)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("retorna 404 para equipe de outra paroquia (nao vaza existencia)", async () => {
      mockPrisma.team.findUnique.mockResolvedValue({ parishId: "outra" });
      await expect(service.getTeam(ADMIN, "t-alheia")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── Unicidade → 409 ───────────────────────────────────

  describe("createTeam", () => {
    it("traduz P2002 em ConflictException (409)", async () => {
      mockPrisma.team.create.mockRejectedValue(p2002());
      await expect(
        service.createTeam(ADMIN, {
          name: "Coroinhas",
          category: MinistryCategory.ALTAR_SERVERS,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("cria com parishId do ator", async () => {
      mockPrisma.team.create.mockResolvedValue({ id: "t1" });
      await service.createTeam(ADMIN, {
        name: "Coroinhas",
        category: MinistryCategory.ALTAR_SERVERS,
      });
      expect(mockPrisma.team.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ parishId: "p1" }),
        }),
      );
    });
  });

  describe("createMembership", () => {
    it("409 quando membro ja vinculado a equipe", async () => {
      mockPrisma.team.findUnique.mockResolvedValue({ parishId: "p1" });
      mockPrisma.member.findUnique.mockResolvedValue({ parishId: "p1" });
      mockPrisma.teamMembership.create.mockRejectedValue(p2002());
      await expect(
        service.createMembership(ADMIN, "t1", { memberId: "m1" }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── Qualificação: função de outra equipe → 400 ────────

  describe("setMembershipFunctions", () => {
    it("400 quando alguma funcao nao pertence a equipe do membership", async () => {
      mockPrisma.teamMembership.findUnique.mockResolvedValue({
        id: "ms1",
        teamId: "t1",
        memberId: "m1",
      });
      mockPrisma.team.findUnique.mockResolvedValue({ parishId: "p1" });
      // pediu 2 funções, mas só 1 pertence à equipe
      mockPrisma.teamFunction.count.mockResolvedValue(1);
      await expect(
        service.setMembershipFunctions(ADMIN, "ms1", ["f1", "f2"]),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("substitui o conjunto quando todas as funcoes pertencem a equipe", async () => {
      mockPrisma.teamMembership.findUnique.mockResolvedValue({
        id: "ms1",
        teamId: "t1",
        memberId: "m1",
      });
      mockPrisma.team.findUnique.mockResolvedValue({ parishId: "p1" });
      mockPrisma.teamFunction.count.mockResolvedValue(2);
      mockPrisma.membershipFunction.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.membershipFunction.createMany.mockResolvedValue({ count: 2 });
      const result = await service.setMembershipFunctions(ADMIN, "ms1", [
        "f1",
        "f2",
      ]);
      expect(result).toEqual({ functionIds: ["f1", "f2"] });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  // ── Soft vs hard delete ───────────────────────────────

  describe("deleteTeam", () => {
    it("soft-delete quando ha memberships/assignments", async () => {
      mockPrisma.team.findUnique.mockResolvedValue({ parishId: "p1" });
      mockPrisma.teamMembership.count.mockResolvedValue(3);
      mockPrisma.assignment.count.mockResolvedValue(0);
      mockPrisma.team.update.mockResolvedValue({ id: "t1", isActive: false });
      await service.deleteTeam(ADMIN, "t1");
      expect(mockPrisma.team.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: { isActive: false },
      });
      expect(mockPrisma.team.delete).not.toHaveBeenCalled();
    });

    it("hard-delete quando a equipe esta vazia", async () => {
      mockPrisma.team.findUnique.mockResolvedValue({ parishId: "p1" });
      mockPrisma.teamMembership.count.mockResolvedValue(0);
      mockPrisma.assignment.count.mockResolvedValue(0);
      mockPrisma.team.delete.mockResolvedValue({ id: "t1" });
      await service.deleteTeam(ADMIN, "t1");
      expect(mockPrisma.team.delete).toHaveBeenCalledWith({
        where: { id: "t1" },
      });
    });
  });

  describe("deleteMember", () => {
    it("sempre soft-delete (historico de assignment)", async () => {
      mockPrisma.member.findUnique.mockResolvedValue({ parishId: "p1" });
      mockPrisma.member.update.mockResolvedValue({ id: "m1", isActive: false });
      await service.deleteMember(ADMIN, "m1");
      expect(mockPrisma.member.update).toHaveBeenCalledWith({
        where: { id: "m1" },
        data: { isActive: false },
      });
    });
  });

  // ── Aviso de duplicata (não bloqueia) ─────────────────

  describe("createMember", () => {
    it("inclui aviso quando ja existe telefone igual na paroquia", async () => {
      mockPrisma.member.count.mockResolvedValue(1);
      mockPrisma.member.create.mockResolvedValue({ id: "m2" });
      const result = await service.createMember(ADMIN, {
        fullName: "Joao da Silva",
        phone: "(11) 99999-8888",
      });
      expect(result).toHaveProperty("warning");
    });

    it("sem aviso quando telefone e unico", async () => {
      mockPrisma.member.count.mockResolvedValue(0);
      mockPrisma.member.create.mockResolvedValue({ id: "m3" });
      const result = await service.createMember(ADMIN, {
        fullName: "Maria Souza",
        phone: "(11) 99999-7777",
      });
      expect(result).not.toHaveProperty("warning");
    });
  });

  // ── Staffing: alvo de outra paróquia → 400 ────────────

  describe("createStaffing", () => {
    it("400 quando o horario (SCHEDULE) nao pertence a paroquia", async () => {
      mockPrisma.team.findUnique.mockResolvedValue({ parishId: "p1" });
      mockPrisma.teamFunction.findUnique.mockResolvedValue({ teamId: "t1" });
      mockPrisma.massSchedule.findUnique.mockResolvedValue({
        parishId: "outra",
      });
      await expect(
        service.createStaffing(ADMIN, "t1", {
          functionId: "f1",
          scope: "SCHEDULE" as never,
          requiredCount: 2,
          massScheduleId: "s-alheio",
        } as never),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
