import {
  Controller,
  Get,
  Put,
  Query,
  Body,
  Req,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import {
  monthSchema,
  memberAvailabilityUpsertSchema,
  memberAvailabilityRulesSchema,
} from "@missas/shared";
import { MemberJwtGuard } from "./auth/member-jwt.guard";
import { AvailabilityService } from "./availability.service";

/**
 * Portal do voluntário (S6) — realm de MEMBRO, tudo sob `MemberJwtGuard`.
 *
 * `req.member` (do JWT) é a única fonte de `memberId`/`parishId`: nunca vêm do
 * path/body. Um membro não lê nem edita dado de outro nem de outra paróquia.
 * Escritas recebem rate limit específico (padrão dos endpoints sensíveis).
 */
interface MemberRequest {
  member: {
    id: string;
    parishId: string;
    realm: "member";
  };
}

@Controller("escala/me")
@UseGuards(MemberJwtGuard, ThrottlerGuard)
export class MemberPortalController {
  constructor(private availability: AvailabilityService) {}

  // GET /escala/me — perfil mínimo p/ o cabeçalho.
  @Get()
  me(@Req() req: MemberRequest) {
    return this.availability.getProfile(req.member);
  }

  // GET /escala/me/occurrences?month=YYYY-MM
  @Get("occurrences")
  occurrences(@Req() req: MemberRequest, @Query("month") month?: string) {
    const parsed = monthSchema.safeParse(month);
    if (!parsed.success) {
      throw new BadRequestException("Informe month no formato YYYY-MM");
    }
    return this.availability.getMonthOccurrences(req.member, parsed.data);
  }

  // PUT /escala/me/availability — upsert do desvio explícito (ou CLEAR).
  @Put("availability")
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  upsertAvailability(@Req() req: MemberRequest, @Body() body: unknown) {
    const input = memberAvailabilityUpsertSchema.parse(body);
    return this.availability.upsertAvailability(req.member, input);
  }

  // GET /escala/me/rules
  @Get("rules")
  rules(@Req() req: MemberRequest) {
    return this.availability.getRules(req.member);
  }

  // PUT /escala/me/rules — replace-set das regras recorrentes.
  @Put("rules")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  replaceRules(@Req() req: MemberRequest, @Body() body: unknown) {
    const input = memberAvailabilityRulesSchema.parse(body);
    return this.availability.replaceRules(req.member, input);
  }
}
