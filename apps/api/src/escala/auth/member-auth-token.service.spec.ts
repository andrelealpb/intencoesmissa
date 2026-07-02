import { Test, TestingModule } from "@nestjs/testing";
import { createHash } from "crypto";
import { MemberAuthTokenService } from "./member-auth-token.service";
import { PrismaService } from "../../prisma/prisma.service";

const sha256 = (raw: string) =>
  createHash("sha256").update(raw).digest("hex");

const mockPrisma = {
  memberAuthToken: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn((ops: unknown[]) =>
    Promise.all(ops as Promise<unknown>[]),
  ),
};

describe("MemberAuthTokenService", () => {
  let service: MemberAuthTokenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemberAuthTokenService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(MemberAuthTokenService);
  });

  afterEach(() => jest.clearAllMocks());

  describe("issueOtp / issueMagicLink", () => {
    it("OTP tem 6 digitos, guarda hash (nunca o bruto) e invalida anteriores", async () => {
      const { raw } = await service.issueOtp("p1", "m1");
      expect(raw).toMatch(/^\d{6}$/);

      // Invalidação dos anteriores não usados do mesmo (memberId, type).
      expect(mockPrisma.memberAuthToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            memberId: "m1",
            type: "OTP",
            usedAt: null,
          }),
        }),
      );
      // Em repouso só o hash.
      const createArg = mockPrisma.memberAuthToken.create.mock.calls[0][0];
      expect(createArg.data.tokenHash).toBe(sha256(raw));
      expect(JSON.stringify(createArg)).not.toContain(raw);
    });

    it("link magico tem 32 bytes (base64url) e guarda hash", async () => {
      const { raw } = await service.issueMagicLink("p1", "m1");
      // 32 bytes em base64url ⇒ 43 chars (sem padding).
      expect(raw).toHaveLength(43);
      expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
      const createArg = mockPrisma.memberAuthToken.create.mock.calls[0][0];
      expect(createArg.data.tokenHash).toBe(sha256(raw));
      expect(createArg.data.type).toBe("MAGIC_LINK");
    });
  });

  describe("verifyOtp", () => {
    it("codigo correto → marca uso unico e retorna true", async () => {
      mockPrisma.memberAuthToken.findFirst.mockResolvedValue({
        id: "t1",
        tokenHash: sha256("123456"),
        attempts: 0,
      });
      const ok = await service.verifyOtp("m1", "123456");
      expect(ok).toBe(true);
      expect(mockPrisma.memberAuthToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "t1" },
          data: expect.objectContaining({ usedAt: expect.any(Date) }),
        }),
      );
    });

    it("sem token vigente (expirado/usado) → false", async () => {
      mockPrisma.memberAuthToken.findFirst.mockResolvedValue(null);
      expect(await service.verifyOtp("m1", "000000")).toBe(false);
      expect(mockPrisma.memberAuthToken.update).not.toHaveBeenCalled();
    });

    it("codigo errado incrementa tentativas sem invalidar (abaixo do teto)", async () => {
      mockPrisma.memberAuthToken.findFirst.mockResolvedValue({
        id: "t1",
        tokenHash: sha256("123456"),
        attempts: 2,
      });
      const ok = await service.verifyOtp("m1", "999999");
      expect(ok).toBe(false);
      const updateArg = mockPrisma.memberAuthToken.update.mock.calls[0][0];
      expect(updateArg.data.attempts).toBe(3);
      expect(updateArg.data.usedAt).toBeUndefined();
    });

    it("na 5a tentativa errada invalida o token (usedAt)", async () => {
      mockPrisma.memberAuthToken.findFirst.mockResolvedValue({
        id: "t1",
        tokenHash: sha256("123456"),
        attempts: 4,
      });
      const ok = await service.verifyOtp("m1", "999999");
      expect(ok).toBe(false);
      const updateArg = mockPrisma.memberAuthToken.update.mock.calls[0][0];
      expect(updateArg.data.attempts).toBe(5);
      expect(updateArg.data.usedAt).toEqual(expect.any(Date));
    });
  });

  describe("consumeMagicLink", () => {
    it("token valido → marca uso unico e retorna memberId", async () => {
      mockPrisma.memberAuthToken.findFirst.mockResolvedValue({
        id: "t1",
        memberId: "m9",
      });
      const memberId = await service.consumeMagicLink("raw-token");
      expect(memberId).toBe("m9");
      expect(mockPrisma.memberAuthToken.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tokenHash: sha256("raw-token"),
            usedAt: null,
          }),
        }),
      );
      expect(mockPrisma.memberAuthToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "t1" },
          data: expect.objectContaining({ usedAt: expect.any(Date) }),
        }),
      );
    });

    it("token inexistente/expirado → null", async () => {
      mockPrisma.memberAuthToken.findFirst.mockResolvedValue(null);
      expect(await service.consumeMagicLink("x")).toBeNull();
      expect(mockPrisma.memberAuthToken.update).not.toHaveBeenCalled();
    });
  });
});
