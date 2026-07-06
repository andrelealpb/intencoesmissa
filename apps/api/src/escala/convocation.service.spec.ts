import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ConvocationService } from "./convocation.service";
import { EscalaAccessService, type EscalaActor } from "./escala-access.service";
import { EscalaNotifyService } from "./escala-notify.service";
import { PrismaService } from "../prisma/prisma.service";

// Equipes da paróquia "p1": t1 tem grupo, t2 não tem.
const TEAMS: Record<
  string,
  { parishId: string; id: string; name: string; whatsappGroupId: string | null }
> = {
  t1: { parishId: "p1", id: "t1", name: "Coroinhas", whatsappGroupId: "g-1" },
  t2: { parishId: "p1", id: "t2", name: "MESC", whatsappGroupId: null },
  alheia: {
    parishId: "outra",
    id: "alheia",
    name: "Alheia",
    whatsappGroupId: "g-x",
  },
};

const mockPrisma = {
  team: {
    findUnique: jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(TEAMS[where.id] ?? null),
    ),
  },
  teamMembership: { findFirst: jest.fn() },
  parish: { findUnique: jest.fn() },
};

const mockNotify = {
  sendGroupConvocation: jest.fn(),
  zapiReady: jest.fn(() => true),
  sendTeamInvite: jest.fn(),
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

const INPUT = { month: "2026-08", teamIds: ["t1", "t2"] };

describe("ConvocationService", () => {
  let service: ConvocationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConvocationService,
        EscalaAccessService,
        { provide: EscalaNotifyService, useValue: mockNotify },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<ConvocationService>(ConvocationService);
    mockNotify.zapiReady.mockReturnValue(true);
    mockPrisma.parish.findUnique.mockResolvedValue({
      id: "p1",
      slug: "par",
      parishName: "Paroquia",
      zapiInstanceId: "i",
      zapiToken: "t",
      zapiClientToken: null,
    });
  });

  afterEach(() => jest.clearAllMocks());

  it("admin convoca varias equipes: envia p/ quem tem grupo, pula quem nao tem", async () => {
    const summary = await service.convoke(ADMIN, INPUT);

    expect(summary.sent).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.failed).toBe(0);
    expect(mockNotify.sendGroupConvocation).toHaveBeenCalledTimes(1);
    expect(mockNotify.sendGroupConvocation).toHaveBeenCalledWith(
      expect.anything(),
      "g-1",
      "agosto de 2026",
      undefined,
    );
    const skipped = summary.results.find((r) => r.teamId === "t2");
    expect(skipped?.status).toBe("skipped");
    expect(skipped?.reason).toMatch(/grupo/i);
  });

  it("coordenador convoca a propria equipe (ok)", async () => {
    mockPrisma.teamMembership.findFirst.mockResolvedValue({ id: "ms1" });
    const summary = await service.convoke(COORD, { month: "2026-08", teamIds: ["t1"] });
    expect(summary.sent).toBe(1);
  });

  it("coordenador em equipe alheia -> 403 (nao envia nada)", async () => {
    // Não coordena t2 (findFirst devolve null) — assertCanManageTeam lança 403.
    mockPrisma.teamMembership.findFirst.mockResolvedValue(null);
    await expect(
      service.convoke(COORD, { month: "2026-08", teamIds: ["t2"] }),
    ).rejects.toThrow(ForbiddenException);
    expect(mockNotify.sendGroupConvocation).not.toHaveBeenCalled();
  });

  it("equipe de outra paroquia -> 404", async () => {
    await expect(
      service.convoke(ADMIN, { month: "2026-08", teamIds: ["alheia"] }),
    ).rejects.toThrow(NotFoundException);
    expect(mockNotify.sendGroupConvocation).not.toHaveBeenCalled();
  });

  it("falha no envio nao derruba as demais (status failed no resumo)", async () => {
    mockNotify.sendGroupConvocation.mockRejectedValueOnce(new Error("z-api 500"));
    const summary = await service.convoke(ADMIN, {
      month: "2026-08",
      teamIds: ["t1"],
    });
    expect(summary.failed).toBe(1);
    expect(summary.sent).toBe(0);
    expect(summary.results[0].status).toBe("failed");
  });

  it("sem Z-API na paroquia -> pula com aviso (nao envia)", async () => {
    mockNotify.zapiReady.mockReturnValue(false);
    const summary = await service.convoke(ADMIN, {
      month: "2026-08",
      teamIds: ["t1"],
    });
    expect(summary.sent).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(summary.results[0].reason).toMatch(/z-api/i);
    expect(mockNotify.sendGroupConvocation).not.toHaveBeenCalled();
  });
});
