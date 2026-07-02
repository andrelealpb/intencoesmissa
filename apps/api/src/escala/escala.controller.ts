import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { OccurrenceService } from "./occurrence.service";
import { materializeRangeSchema, updateOccurrenceSchema } from "@missas/shared";

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    role: string;
    parishId: string | null;
  };
}

function getParishId(req: AuthenticatedRequest): string {
  const parishId = req.user.parishId;
  if (!parishId) {
    throw new ForbiddenException("Usuario nao vinculado a uma paroquia");
  }
  return parishId;
}

const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;

@Controller("admin/escala/occurrences")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("PARISH_ADMIN")
export class EscalaController {
  constructor(private occurrences: OccurrenceService) {}

  // POST /admin/escala/occurrences/materialize
  @Post("materialize")
  materialize(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const { from, to } = materializeRangeSchema.parse(body);
    return this.occurrences.materialize(getParishId(req), from, to);
  }

  // GET /admin/escala/occurrences?from=&to=
  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    if (!from || !to || !isoDateRe.test(from) || !isoDateRe.test(to)) {
      throw new BadRequestException(
        "Informe from e to no formato YYYY-MM-DD",
      );
    }
    return this.occurrences.list(getParishId(req), from, to);
  }

  // PATCH /admin/escala/occurrences/:id
  @Patch(":id")
  update(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const data = updateOccurrenceSchema.parse(body);
    return this.occurrences.update(getParishId(req), id, data);
  }
}
