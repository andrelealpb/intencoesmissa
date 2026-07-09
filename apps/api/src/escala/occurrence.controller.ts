import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { monthSchema, reconcileMonthSchema } from "@missas/shared";
import { EscalaAuthGuard } from "./auth/escala-auth.guard";
import { OccurrenceService } from "./occurrence.service";
import { EscalaAccessService } from "./escala-access.service";
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
 * Gestão de ocorrências do mês aberto (S2.1). Diferente do `EscalaController`
 * (materialização, admin-only sob `/admin/escala/occurrences`), estes endpoints
 * são de **gestão do mês** e vivem sob `/escala/occurrences` com o
 * `EscalaAuthGuard`: autorizados a **admin OU coordenador** da paróquia
 * (`EscalaAccessService.assertCanManageOccurrences`). `parishId` sempre do ator.
 *
 *  - GET    /escala/occurrences?month=YYYY-MM  → lista + indicadores (escala?
 *                                                disponibilidade? solenidade?
 *                                                ainda no cadastro?).
 *  - POST   /escala/occurrences/reconcile      → reconcilia o mês com o cadastro.
 *  - DELETE /escala/occurrences/:id[?force]    → exclui (aviso+confirmação se
 *                                                tiver escala/disponibilidade).
 */
@Controller("escala/occurrences")
@UseGuards(EscalaAuthGuard)
export class OccurrenceController {
  constructor(
    private occurrences: OccurrenceService,
    private access: EscalaAccessService,
  ) {}

  // GET /escala/occurrences?month=YYYY-MM
  @Get()
  async list(@Req() req: AuthenticatedRequest, @Query("month") month?: string) {
    const parishId = await this.access.assertCanManageOccurrences(getActor(req));
    const parsed = monthSchema.safeParse(month);
    if (!parsed.success) {
      throw new BadRequestException("Informe month no formato YYYY-MM");
    }
    return this.occurrences.listForManagement(parishId, parsed.data);
  }

  // POST /escala/occurrences/reconcile { month }
  @Post("reconcile")
  async reconcile(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parishId = await this.access.assertCanManageOccurrences(getActor(req));
    const { month } = reconcileMonthSchema.parse(body);
    return this.occurrences.reconcile(parishId, month);
  }

  // DELETE /escala/occurrences/:id?force=true
  @Delete(":id")
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Query("force") force?: string,
  ) {
    const parishId = await this.access.assertCanManageOccurrences(getActor(req));
    return this.occurrences.deleteOccurrence(parishId, id, force === "true");
  }
}
