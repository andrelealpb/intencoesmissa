/**
 * Sessão do MEMBRO (S6) — realm separado do admin (NextAuth). O JWT de membro
 * vive num cookie próprio, escopado por paróquia (slug), e NUNCA se mistura com
 * a sessão do admin. O portal é client-side; todas as chamadas mandam o token
 * no header Authorization (o cookie não vaza para a API, que roda noutra origem).
 */

const COOKIE_PREFIX = "escala_member_token_";
// 30 dias — casa com o TTL do JWT de membro (MEMBER_JWT_TTL).
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function cookieName(slug: string): string {
  return `${COOKIE_PREFIX}${slug}`;
}

export function getMemberToken(slug: string): string | null {
  if (typeof document === "undefined") return null;
  const name = cookieName(slug) + "=";
  const parts = document.cookie.split("; ");
  for (const part of parts) {
    if (part.startsWith(name)) {
      return decodeURIComponent(part.slice(name.length));
    }
  }
  return null;
}

export function setMemberToken(slug: string, token: string): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${cookieName(slug)}=${encodeURIComponent(token)}` +
    `; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

export function clearMemberToken(slug: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${cookieName(slug)}=; Path=/; Max-Age=0; SameSite=Lax`;
}
