import {
  Controller,
  Get,
  Put,
  Param,
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
  memberAssignmentsQuerySchema,
  memberAssignmentStatusSchema,
} from "@missas/shared";
import { MemberJwtGuard } from "./auth/member-jwt.guard";
import { AvailabilityService } from "./availability.service";
import { MemberAssignmentService } from "./member-assignment.service";

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
  constructor(
    private availability: AvailabilityService,
    private assignments: MemberAssignmentService,
  ) {}

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

  // GET /escala/me/assignments?from=YYYY-MM-DD&to=YYYY-MM-DD — minhas escalas
  // publicadas (S9/L3). Só o próprio membro.
  @Get("assignments")
  myAssignments(@Req() req: MemberRequest, @Query() query: unknown) {
    const parsed = memberAssignmentsQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throw new BadRequestException("Intervalo invalido (use from/to em YYYY-MM-DD)");
    }
    return this.assignments.listMine(req.member, parsed.data);
  }

  // PUT /escala/me/assignments/:id — confirma/recusa a própria escala publicada
  // (S9/L3). Recusa marca DECLINED, reabre a lacuna na S8 e avisa o coordenador.
  @Put("assignments/:id")
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  setAssignmentStatus(
    @Req() req: MemberRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = memberAssignmentStatusSchema.parse(body);
    return this.assignments.setStatus(req.member, id, input);
  }
}
