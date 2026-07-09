import { Test, TestingModule } from "@nestjs/testing";
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { MemberAssignmentService } from "./member-assignment.service";
import { EscalaNotifyService } from "./escala-notify.service";
import { PrismaService } from "../prisma/prisma.service";

const MEMBER = { id: "m1", parishId: "p1" };

const mockPrisma = {
  assignment: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  parish: { findUnique: jest.fn() },
  member: { findUnique: jest.fn() },
};

const mockNotify = { sendDeclineNotice: jest.fn().mockResolvedValue(undefined) };

function publishedAssignment(over: Record<string, unknown> = {}) {
  return {
    id: "a1",
    parishId: "p1",
    memberId: "m1",
    publishedAt: new Date("2026-07-01T00:00:00Z"),
    occurrence: { date: new Date(Date.UTC(2026, 6, 12)), time: "10:00" },
    team: { id: "t1", name: "Coroinhas", whatsappGroupId: "grp1" },
    function: { name: "Cruz" },
    ...over,
  };
}

describe("MemberAssignmentService", () => {
  let service: MemberAssignmentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemberAssignmentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EscalaNotifyService, useValue: mockNotify },
      ],
    }).compile();
    service = module.get(MemberAssignmentService);
  });

  afterEach(() => jest.clearAllMocks());

  describe("listMine", () => {
    it("busca só as escalas publicadas do próprio membro", async () => {
      mockPrisma.assignment.findMany.mockResolvedValue([]);
      await service.listMine(MEMBER, {});
      const where = mockPrisma.assignment.findMany.mock.calls[0][0].where;
      expect(where.memberId).toBe("m1");
      expect(where.parishId).toBe("p1");
      expect(where.publishedAt).toEqual({ not: null });
    });
  });

  describe("setStatus", () => {
    it("confirma a própria escala publicada", async () => {
      mockPrisma.assignment.findUnique.mockResolvedValue(publishedAssignment());
      mockPrisma.assignment.update.mockResolvedValue({
        id: "a1",
        status: "CONFIRMED",
        confirmedAt: new Date(),
        declinedAt: null,
      });

      const res = await service.setStatus(MEMBER, "a1", { status: "CONFIRMED" });

      expect(res.status).toBe("CONFIRMED");
      const data = mockPrisma.assignment.update.mock.calls[0][0].data;
      expect(data.status).toBe("CONFIRMED");
      expect(data.declinedAt).toBeNull();
      expect(mockNotify.sendDeclineNotice).not.toHaveBeenCalled();
    });

    it("recusa marca DECLINED e notifica o coordenador (sem re-escala)", async () => {
      mockPrisma.assignment.findUnique.mockResolvedValue(publishedAssignment());
      mockPrisma.assignment.update.mockResolvedValue({
        id: "a1",
        status: "DECLINED",
        confirmedAt: null,
        declinedAt: new Date(),
      });
      mockPrisma.parish.findUnique.mockResolvedValue({
        id: "p1",
        zapiInstanceId: "i",
        zapiToken: "t",
      });
      mockPrisma.member.findUnique.mockResolvedValue({ fullName: "Ana Maria" });

      const res = await service.setStatus(MEMBER, "a1", { status: "DECLINED" });

      expect(res.status).toBe("DECLINED");
      const data = mockPrisma.assignment.update.mock.calls[0][0].data;
      expect(data.status).toBe("DECLINED");
      expect(data.confirmedAt).toBeNull();
      // Notificação ao coordenador disparada.
      expect(mockNotify.sendDeclineNotice).toHaveBeenCalledTimes(1);
      const [, team, memberName] = mockNotify.sendDeclineNotice.mock.calls[0];
      expect(team.whatsappGroupId).toBe("grp1");
      expect(memberName).toBe("Ana Maria");
    });

    it("escala de OUTRO membro → 403", async () => {
      mockPrisma.assignment.findUnique.mockResolvedValue(
        publishedAssignment({ memberId: "outro" }),
      );
      await expect(
        service.setStatus(MEMBER, "a1", { status: "CONFIRMED" }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.assignment.update).not.toHaveBeenCalled();
    });

    it("escala de outra paróquia → 404 (não vaza)", async () => {
      mockPrisma.assignment.findUnique.mockResolvedValue(
        publishedAssignment({ parishId: "p2", memberId: "m1" }),
      );
      await expect(
        service.setStatus(MEMBER, "a1", { status: "CONFIRMED" }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("inexistente → 404", async () => {
      mockPrisma.assignment.findUnique.mockResolvedValue(null);
      await expect(
        service.setStatus(MEMBER, "a1", { status: "CONFIRMED" }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("escala ainda em rascunho (não publicada) → 400", async () => {
      mockPrisma.assignment.findUnique.mockResolvedValue(
        publishedAssignment({ publishedAt: null }),
      );
      await expect(
        service.setStatus(MEMBER, "a1", { status: "CONFIRMED" }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.assignment.update).not.toHaveBeenCalled();
    });

    it("degradação graciosa: falha na notificação não quebra a recusa", async () => {
      mockPrisma.assignment.findUnique.mockResolvedValue(publishedAssignment());
      mockPrisma.assignment.update.mockResolvedValue({
        id: "a1",
        status: "DECLINED",
        confirmedAt: null,
        declinedAt: new Date(),
      });
      mockPrisma.parish.findUnique.mockRejectedValue(new Error("db down"));

      const res = await service.setStatus(MEMBER, "a1", { status: "DECLINED" });
      expect(res.status).toBe("DECLINED"); // recusa persistiu mesmo assim
    });
  });
});
