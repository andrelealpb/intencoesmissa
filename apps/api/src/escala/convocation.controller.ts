import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
} from "@nestjs/common";
import { convocationSchema } from "@missas/shared";
import { EscalaAuthGuard } from "./auth/escala-auth.guard";
import { ConvocationService } from "./convocation.service";
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
 * Convocação de disponibilidade (S6.5 — Parte 2). Passo **separado** da
 * materialização (que segue no `EscalaController`): "Abrir mês" cria as
 * ocorrências; aqui apenas dispara a convocação nos grupos.
 *
 * `EscalaAuthGuard` (admin OU membro) + `EscalaAccessService` no serviço: o
 * coordenador só convoca a própria equipe (403 em alheia); admin escolhe as
 * equipes. Convive com os demais controllers sob `admin/escala`.
 */
@Controller("admin/escala")
@UseGuards(EscalaAuthGuard)
export class ConvocationController {
  constructor(private convocation: ConvocationService) {}

  // POST /admin/escala/convoke
  @Post("convoke")
  convoke(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const data = convocationSchema.parse(body);
    return this.convocation.convoke(getActor(req), data);
  }
}
