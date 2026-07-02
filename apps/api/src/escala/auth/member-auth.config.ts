/**
 * Configuração do realm de autenticação de MEMBRO (S5). Centraliza as variáveis
 * de ambiente novas, com os defaults documentados no doc da sessão e no
 * `.env.example`.
 *
 * `MEMBER_JWT_SECRET` é obrigatória em produção e **nunca** pode coincidir com o
 * `JWT_SECRET` do admin — realms criptograficamente distintos (D1). Em dev/test
 * caímos para um default próprio, distinto do admin, para não travar o boot/CI.
 */

const DEV_MEMBER_JWT_SECRET = "dev-member-secret";

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function memberJwtSecret(): string {
  const secret = process.env.MEMBER_JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "MEMBER_JWT_SECRET e obrigatoria em producao (realm de membro — S5).",
      );
    }
    return DEV_MEMBER_JWT_SECRET;
  }
  // Guardrail de isolamento de realm: o secret do membro não pode ser o do admin.
  if (secret === process.env.JWT_SECRET) {
    throw new Error(
      "MEMBER_JWT_SECRET nao pode ser igual a JWT_SECRET (isolamento de realm — D1).",
    );
  }
  return secret;
}

export const memberAuthConfig = {
  jwtSecret: memberJwtSecret(),
  jwtTtl: process.env.MEMBER_JWT_TTL || "30d",
  otpTtlMin: readInt("OTP_TTL_MIN", 10),
  magicLinkTtlMin: readInt("MAGIC_LINK_TTL_MIN", 20),
  portalUrl: process.env.MEMBER_PORTAL_URL || "http://localhost:3000",
  /** Teto de tentativas por token de OTP (baixa entropia → segurança vem daqui). */
  otpMaxAttempts: 5,
};
