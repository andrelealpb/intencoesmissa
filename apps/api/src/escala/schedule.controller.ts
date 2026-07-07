import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
} from "@nestjs/common";
import { scheduleSuggestSchema } from "@missas/shared";
import { EscalaAuthGuard } from "./auth/escala-auth.guard";
import { SuggestionService } from "./suggestion.service";
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
 * Montagem de escala (S7). Por ora, apenas o **motor de sugestão** — override
 * manual, visão de conflitos e publicação ficam para a S8.
 *
 * `EscalaAuthGuard` (admin OU membro) + `SuggestionService` (que aplica
 * `EscalaAccessService`): admin sugere para qualquer equipe da paróquia; o
 * coordenador só para as que coordena.
 */
@Controller("escala/schedule")
@UseGuards(EscalaAuthGuard)
export class ScheduleController {
  constructor(private suggestion: SuggestionService) {}

  // POST /escala/schedule/suggest
  @Post("suggest")
  suggest(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const data = scheduleSuggestSchema.parse(body);
    return this.suggestion.suggest(getActor(req), data);
  }
}
