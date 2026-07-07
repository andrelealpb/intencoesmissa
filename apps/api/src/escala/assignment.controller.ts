import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  UnauthorizedException,
} from "@nestjs/common";
import { assignmentCreateSchema } from "@missas/shared";
import { z } from "zod";
import { EscalaAuthGuard } from "./auth/escala-auth.guard";
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

const idParamSchema = z.string().uuid("Identificador invalido");

/**
 * Edição manual de atribuições (S8). Realm coordenador/admin (`EscalaAuthGuard`);
 * a autorização por equipe mora no `ScheduleService`/`EscalaAccessService`.
 *
 *  - POST   /escala/assignments      → atribuição manual (override consciente — V2;
 *                                       409 no unique(occurrence, member) — V3).
 *  - DELETE /escala/assignments/:id  → remove (rascunho ou publicado — V4).
 */
@Controller("escala/assignments")
@UseGuards(EscalaAuthGuard)
export class AssignmentController {
  constructor(private schedule: ScheduleService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const data = assignmentCreateSchema.parse(body);
    return this.schedule.createAssignment(getActor(req), data);
  }

  @Delete(":id")
  remove(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.schedule.deleteAssignment(getActor(req), idParamSchema.parse(id));
  }
}
