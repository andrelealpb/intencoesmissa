import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import {
  EscalaAccessService,
  type EscalaActor,
} from "./escala-access.service";
import { PrismaService } from "../prisma/prisma.service";

const mockPrisma = {
  team: { findUnique: jest.fn() },
  teamMembership: { findFirst: jest.fn() },
};

const ADMIN: EscalaActor = {
  kind: "admin",
  userId: "u1",
  role: "PARISH_ADMIN",
  parishId: "p1",
};
const COORD: EscalaActor = { kind: "member", memberId: "m1", parishId: "p1" };

describe("EscalaAccessService", () => {
  let access: EscalaAccessService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscalaAccessService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    access = module.get(EscalaAccessService);
  });

  afterEach(() => jest.clearAllMocks());

  describe("assertCanManageParish (nivel paroquia — admin-only)", () => {
    it("admin PARISH_ADMIN passa e retorna o parishId", () => {
      expect(access.assertCanManageParish(ADMIN)).toBe("p1");
    });

    it("coordenador (member) recebe Forbidden", () => {
      expect(() => access.assertCanManageParish(COORD)).toThrow(
        ForbiddenException,
      );
    });

    it("admin sem role PARISH_ADMIN recebe Forbidden", () => {
      expect(() =>
        access.assertCanManageParish({ ...ADMIN, role: "OTHER" }),
      ).toThrow(ForbiddenException);
    });
  });

  describe("assertCanManageTeam (nivel equipe — admin ∪ coordenador)", () => {
    it("equipe de outra paroquia → 404 (nao vaza existencia)", async () => {
      mockPrisma.team.findUnique.mockResolvedValue({ parishId: "outra" });
      await expect(access.assertCanManageTeam(ADMIN, "t1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("admin gere qualquer equipe da sua paroquia", async () => {
      mockPrisma.team.findUnique.mockResolvedValue({ parishId: "p1" });
      await expect(access.assertCanManageTeam(ADMIN, "t1")).resolves.toBe("p1");
      expect(mockPrisma.teamMembership.findFirst).not.toHaveBeenCalled();
    });

    it("coordenador ativo da propria equipe passa (lido do banco)", async () => {
      mockPrisma.team.findUnique.mockResolvedValue({ parishId: "p1" });
      mockPrisma.teamMembership.findFirst.mockResolvedValue({ id: "tm1" });
      await expect(access.assertCanManageTeam(COORD, "t1")).resolves.toBe("p1");
      // A checagem exige isCoordinator + isActive no banco.
      expect(mockPrisma.teamMembership.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            teamId: "t1",
            memberId: "m1",
            isCoordinator: true,
            isActive: true,
          }),
        }),
      );
    });

    it("membro sem vinculo de coordenador na equipe → 403", async () => {
      mockPrisma.team.findUnique.mockResolvedValue({ parishId: "p1" });
      mockPrisma.teamMembership.findFirst.mockResolvedValue(null);
      await expect(access.assertCanManageTeam(COORD, "t1")).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("revogar isCoordinator tira o acesso imediatamente (banco → null)", async () => {
      mockPrisma.team.findUnique.mockResolvedValue({ parishId: "p1" });
      // Simula pós-revogação: nenhum vínculo isCoordinator+isActive.
      mockPrisma.teamMembership.findFirst.mockResolvedValue(null);
      await expect(access.assertCanManageTeam(COORD, "t1")).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("isAdmin", () => {
    it("true so para admin PARISH_ADMIN", () => {
      expect(access.isAdmin(ADMIN)).toBe(true);
      expect(access.isAdmin(COORD)).toBe(false);
      expect(access.isAdmin({ ...ADMIN, role: "OTHER" })).toBe(false);
    });
  });
});
