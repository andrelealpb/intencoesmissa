import { Injectable } from "@nestjs/common";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { MemberAuthTokenType } from "@missas/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { memberAuthConfig } from "./member-auth.config";

export interface IssuedToken {
  /** Valor bruto — só existe em memória, entregue ao membro. Nunca persistido. */
  raw: string;
  expiresAt: Date;
}

/**
 * Geração e validação dos tokens de auth de membro (`MemberAuthToken`), em
 * Postgres puro (D10). Regras (S5):
 * - Só `sha256(raw)` em repouso (`tokenHash`); o bruto nunca toca o banco.
 * - Ao emitir, invalida os anteriores não usados do mesmo `(memberId, type)`.
 * - OTP: 6 dígitos, comparação em tempo constante, teto de tentativas.
 * - Link mágico: 32 bytes aleatórios (base64url), uso único.
 */
@Injectable()
export class MemberAuthTokenService {
  constructor(private prisma: PrismaService) {}

  private hash(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }

  /** Emite um OTP de 6 dígitos, invalidando OTPs anteriores não usados. */
  async issueOtp(parishId: string, memberId: string): Promise<IssuedToken> {
    const raw = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = this.expiryFromNow(memberAuthConfig.otpTtlMin);
    await this.persist(parishId, memberId, MemberAuthTokenType.OTP, raw, expiresAt);
    return { raw, expiresAt };
  }

  /** Emite um link mágico opaco de 32 bytes, invalidando links anteriores. */
  async issueMagicLink(
    parishId: string,
    memberId: string,
  ): Promise<IssuedToken> {
    const raw = randomBytes(32).toString("base64url");
    const expiresAt = this.expiryFromNow(memberAuthConfig.magicLinkTtlMin);
    await this.persist(
      parishId,
      memberId,
      MemberAuthTokenType.MAGIC_LINK,
      raw,
      expiresAt,
    );
    return { raw, expiresAt };
  }

  /**
   * Valida um OTP para um membro. Retorna `true` se válido (e marca uso único);
   * caso contrário `false`. Ao estourar o teto de tentativas, invalida o token
   * (obriga novo request). Comparação de hash em tempo constante.
   */
  async verifyOtp(memberId: string, code: string): Promise<boolean> {
    const token = await this.prisma.memberAuthToken.findFirst({
      where: {
        memberId,
        type: MemberAuthTokenType.OTP,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!token) return false;

    const matches = this.constantTimeEquals(this.hash(code), token.tokenHash);

    if (matches) {
      await this.prisma.memberAuthToken.update({
        where: { id: token.id },
        data: { usedAt: new Date(), attempts: { increment: 1 } },
      });
      return true;
    }

    // Falhou: conta a tentativa; ao atingir o teto, invalida o token.
    const nextAttempts = token.attempts + 1;
    await this.prisma.memberAuthToken.update({
      where: { id: token.id },
      data: {
        attempts: nextAttempts,
        ...(nextAttempts >= memberAuthConfig.otpMaxAttempts
          ? { usedAt: new Date() }
          : {}),
      },
    });
    return false;
  }

  /**
   * Valida um link mágico pelo valor bruto. Busca por `tokenHash` (não vaza
   * existência), checa não-expirado/não-usado, marca uso único e devolve o
   * `memberId` vinculado. `null` se inválido.
   */
  async consumeMagicLink(raw: string): Promise<string | null> {
    const token = await this.prisma.memberAuthToken.findFirst({
      where: {
        tokenHash: this.hash(raw),
        type: MemberAuthTokenType.MAGIC_LINK,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!token) return null;

    await this.prisma.memberAuthToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });
    return token.memberId;
  }

  private expiryFromNow(minutes: number): Date {
    return new Date(Date.now() + minutes * 60_000);
  }

  private async persist(
    parishId: string,
    memberId: string,
    type: MemberAuthTokenType,
    raw: string,
    expiresAt: Date,
  ): Promise<void> {
    // Só o último vale: invalida anteriores não usados do mesmo (memberId, type).
    await this.prisma.$transaction([
      this.prisma.memberAuthToken.updateMany({
        where: { memberId, type, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.memberAuthToken.create({
        data: {
          parishId,
          memberId,
          type,
          tokenHash: this.hash(raw),
          expiresAt,
        },
      }),
    ]);
  }

  /** Compara dois hashes hex em tempo constante (mesmo comprimento sempre). */
  private constantTimeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
