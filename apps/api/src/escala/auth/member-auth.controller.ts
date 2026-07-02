import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import {
  memberAuthRequestSchema,
  memberAuthVerifySchema,
} from "@missas/shared";
import { MemberAuthService } from "./member-auth.service";

const GENERIC_UNAUTHORIZED = "Codigo invalido ou expirado.";

/**
 * Endpoints públicos do realm de membro (S5), escopados por paróquia via slug.
 * Rate limiting reusa o `ThrottlerModule` global (por IP). O teto de 5
 * tentativas por token (no token service) complementa o limite em `verify`.
 *
 * Todas as respostas de falha são **genéricas** (anti-enumeração).
 */
@Controller("escala/auth")
@UseGuards(ThrottlerGuard)
export class MemberAuthController {
  constructor(private auth: MemberAuthService) {}

  // POST /escala/auth/request — sempre 200 genérico.
  @Post("request")
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async request(@Body() body: unknown) {
    const input = memberAuthRequestSchema.parse(body);
    return this.auth.request(input);
  }

  // POST /escala/auth/verify — OTP → { token } ou 401 genérico.
  @Post("verify")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verify(@Body() body: unknown) {
    const input = memberAuthVerifySchema.parse(body);
    const result = await this.auth.verifyOtp(input);
    if (!result) throw new UnauthorizedException(GENERIC_UNAUTHORIZED);
    return result;
  }

  // GET /escala/auth/magic?token=… — link mágico → { token } ou 401 genérico.
  @Get("magic")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async magic(@Query("token") token?: string) {
    const result = await this.auth.verifyMagicLink(token ?? "");
    if (!result) throw new UnauthorizedException(GENERIC_UNAUTHORIZED);
    return result;
  }
}
