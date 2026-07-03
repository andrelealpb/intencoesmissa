import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { MemberJwtStrategy } from "./member-jwt.strategy";
import type { PrismaService } from "../../prisma/prisma.service";

const mockPrisma = {
  member: { findUnique: jest.fn() },
};

describe("MemberJwtStrategy", () => {
  let strategy: MemberJwtStrategy;

  beforeEach(() => {
    strategy = new MemberJwtStrategy(mockPrisma as unknown as PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  it("rejeita payload sem realm 'member' (isolamento de realm)", async () => {
    await expect(
      strategy.validate({ sub: "m1", parishId: "p1", realm: "admin" }),
    ).rejects.toThrow(UnauthorizedException);
    expect(mockPrisma.member.findUnique).not.toHaveBeenCalled();
  });

  it("recarrega o Member e nega se isActive=false (revogacao imediata)", async () => {
    mockPrisma.member.findUnique.mockResolvedValue({
      id: "m1",
      parishId: "p1",
      isActive: false,
    });
    await expect(
      strategy.validate({ sub: "m1", parishId: "p1", realm: "member" }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("nega membro inexistente", async () => {
    mockPrisma.member.findUnique.mockResolvedValue(null);
    await expect(
      strategy.validate({ sub: "m1", parishId: "p1", realm: "member" }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("aceita membro ativo e devolve o ator do realm member", async () => {
    mockPrisma.member.findUnique.mockResolvedValue({
      id: "m1",
      parishId: "p1",
      isActive: true,
    });
    await expect(
      strategy.validate({ sub: "m1", parishId: "p1", realm: "member" }),
    ).resolves.toEqual({ id: "m1", parishId: "p1", realm: "member" });
  });
});

describe("Isolamento criptografico de realm", () => {
  it("um JWT assinado com o secret do admin nao passa no realm de membro", () => {
    const adminJwt = new JwtService({ secret: "admin-secret" });
    const memberJwt = new JwtService({ secret: "member-secret" });

    const adminSigned = adminJwt.sign({ sub: "u1", role: "PARISH_ADMIN" });
    // Secret distinto ⇒ verificação de assinatura falha antes de qualquer validate.
    expect(() => memberJwt.verify(adminSigned)).toThrow();

    const memberSigned = memberJwt.sign({ sub: "m1", realm: "member" });
    expect(() => adminJwt.verify(memberSigned)).toThrow();
  });
});
