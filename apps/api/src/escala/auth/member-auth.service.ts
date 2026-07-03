import { Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Member } from "@prisma/client";
import type {
  MemberAuthRequestInput,
  MemberAuthVerifyInput,
} from "@missas/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { MemberAuthTokenService } from "./member-auth-token.service";
import { MemberAuthDeliveryService } from "./member-auth-delivery.service";

const GENERIC_REQUEST_MESSAGE =
  "Se voce esta cadastrado, enviamos um codigo/link de acesso.";

export interface AuthResult {
  token: string;
}

/**
 * Orquestra o fluxo de login sem senha do membro (S5): `request → verify`
 * (OTP) e `magic` (link). Anti-enumeração e degradação graciosa são
 * inegociáveis — nada distingue "não existe" de "existe" no response.
 *
 * O JWT é assinado com o `JwtService` scopeado ao `MEMBER_JWT_SECRET`
 * (registrado no `EscalaModule`), isolando o realm do admin (D1).
 */
@Injectable()
export class MemberAuthService {
  private readonly logger = new Logger(MemberAuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private tokens: MemberAuthTokenService,
    private delivery: MemberAuthDeliveryService,
  ) {}

  /**
   * Sempre responde genérico (200). Só entrega de fato se a paróquia existe e o
   * membro está cadastrado e ativo. Nunca revela qual dos dois falhou.
   */
  async request(
    input: MemberAuthRequestInput,
  ): Promise<{ message: string }> {
    const parish = await this.prisma.parish.findUnique({
      where: { slug: input.parishSlug },
    });
    const member = parish
      ? await this.resolveMember(parish.id, input.identifier)
      : null;

    if (parish && member) {
      await this.delivery.deliver(parish, member, input.channel);
    } else {
      this.logger.log(
        `request anti-enumeracao: identificador desconhecido (slug=${input.parishSlug}).`,
      );
    }

    return { message: GENERIC_REQUEST_MESSAGE };
  }

  /**
   * Valida um OTP. Retorna `{ token }` ou `null` (o controller traduz `null`
   * para 401 genérico).
   */
  async verifyOtp(input: MemberAuthVerifyInput): Promise<AuthResult | null> {
    const parish = await this.prisma.parish.findUnique({
      where: { slug: input.parishSlug },
    });
    if (!parish) return null;

    const member = await this.resolveMember(parish.id, input.identifier);
    if (!member) return null;

    const ok = await this.tokens.verifyOtp(member.id, input.code);
    if (!ok) return null;

    return { token: await this.signToken(member) };
  }

  /**
   * Valida um link mágico pelo token bruto. Retorna `{ token }` ou `null`.
   */
  async verifyMagicLink(rawToken: string): Promise<AuthResult | null> {
    if (!rawToken) return null;
    const memberId = await this.tokens.consumeMagicLink(rawToken);
    if (!memberId) return null;

    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
    });
    if (!member || !member.isActive) return null;

    return { token: await this.signToken(member) };
  }

  /**
   * Resolve um `Member` ativo da paróquia por e-mail (contém `@`) ou telefone.
   * Para telefone, tenta o valor cru e o formato canônico `(XX) XXXXX-XXXX`.
   */
  private async resolveMember(
    parishId: string,
    identifier: string,
  ): Promise<Member | null> {
    const value = identifier.trim();
    if (value.includes("@")) {
      return this.prisma.member.findFirst({
        where: {
          parishId,
          isActive: true,
          email: { equals: value, mode: "insensitive" },
        },
      });
    }

    const candidates = phoneCandidates(value);
    return this.prisma.member.findFirst({
      where: { parishId, isActive: true, phone: { in: candidates } },
    });
  }

  private async signToken(member: Member): Promise<string> {
    const coordinatorTeamIds = await this.coordinatorTeamIds(member.id);
    return this.jwt.sign({
      sub: member.id,
      parishId: member.parishId,
      realm: "member",
      // Conveniência de UI (S6) — NUNCA fonte de autorização (lida do banco).
      coordinatorTeamIds,
    });
  }

  private async coordinatorTeamIds(memberId: string): Promise<string[]> {
    const rows = await this.prisma.teamMembership.findMany({
      where: { memberId, isCoordinator: true, isActive: true },
      select: { teamId: true },
    });
    return rows.map((r) => r.teamId);
  }
}

/**
 * Gera candidatos de telefone: o valor cru e, se houver 10/11 dígitos, o
 * formato canônico armazenado `(XX) XXXXX-XXXX` / `(XX) XXXX-XXXX`.
 */
function phoneCandidates(value: string): string[] {
  const set = new Set<string>([value]);
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) {
    set.add(`(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`);
  } else if (digits.length === 10) {
    set.add(`(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`);
  }
  return [...set];
}
