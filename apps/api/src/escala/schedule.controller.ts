import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  UnauthorizedException,
} from "@nestjs/common";
import {
  scheduleSuggestSchema,
  scheduleGridQuerySchema,
  schedulePublishSchema,
} from "@missas/shared";
import { EscalaAuthGuard } from "./auth/escala-auth.guard";
import { SuggestionService } from "./suggestion.service";
import { ScheduleService } from "./schedule.service";
import type { EscalaActor } from "./escala-access.service";

interface AuthenticatedRequest {
  actor?: EscalaActor;
}

function getActor(req: AuthenticatedRequest): EscalaActor {
  if (!req.actor || !req.actor.parishId) {
    throw new UnauthorizedException("Ator nao autenticado");
  }
  return req.actor;
}

/**
 * Montagem de escala — tela do coordenador (S7/S8, backend).
 *
 * `EscalaAuthGuard` (admin OU membro) + as costuras do `EscalaAccessService`
 * dentro dos services: admin em qualquer equipe da paróquia; coordenador só nas
 * que coordena. `parishId` sempre do ator.
 *
 *  - GET  /escala/schedule?month&teamId  → grade (ocorrências + assignments +
 *                                          gaps + candidatos por vaga).
 *  - POST /escala/schedule/suggest       → rascunho guloso da S7.
 *  - POST /escala/schedule/publish       → publica a (equipe, mês) — V4.
 */
@Controller("escala/schedule")
@UseGuards(EscalaAuthGuard)
export class ScheduleController {
  constructor(
    private suggestion: SuggestionService,
    private schedule: ScheduleService,
  ) {}

  // GET /escala/schedule?month=YYYY-MM&teamId=...
  @Get()
  grid(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    const data = scheduleGridQuerySchema.parse(query);
    return this.schedule.getGrid(getActor(req), data);
  }

  // POST /escala/schedule/suggest (S7)
  @Post("suggest")
  suggest(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const data = scheduleSuggestSchema.parse(body);
    return this.suggestion.suggest(getActor(req), data);
  }

  // POST /escala/schedule/publish (S8/V4)
  @Post("publish")
  publish(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const data = schedulePublishSchema.parse(body);
    return this.schedule.publish(getActor(req), data);
  }
}
