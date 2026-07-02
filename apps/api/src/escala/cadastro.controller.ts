import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import {
  teamSchema,
  teamUpdateSchema,
  teamFunctionSchema,
  teamFunctionUpdateSchema,
  memberSchema,
  memberUpdateSchema,
  teamMembershipSchema,
  teamMembershipUpdateSchema,
  membershipFunctionsSchema,
  staffingRequirementSchema,
  staffingRequirementCreateSchema,
} from "@missas/shared";
import { CadastroService } from "./cadastro.service";
import type { AdminActor } from "./escala-access.service";

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    role: string;
    parishId: string | null;
  };
}

function getActor(req: AuthenticatedRequest): AdminActor {
  if (!req.user.parishId) {
    throw new ForbiddenException("Usuario nao vinculado a uma paroquia");
  }
  return {
    id: req.user.id,
    role: req.user.role,
    parishId: req.user.parishId,
  };
}

function parseBool(value?: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

/**
 * Cadastro backend do módulo Escala (S3). Todos os endpoints são admin-only
 * (`PARISH_ADMIN`) nesta fase — a via de coordenador entra em S5/S6 via
 * `EscalaAccessService`. A autorização mora no service (a costura), não aqui.
 *
 * Convive com o `EscalaController` (S2, ocorrências) sob o mesmo prefixo
 * `admin/escala`, em sub-rotas distintas.
 */
@Controller("admin/escala")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("PARISH_ADMIN")
export class CadastroController {
  constructor(private cadastro: CadastroService) {}

  // ── Teams ───────────────────────────────────────────────

  @Get("teams")
  listTeams(@Req() req: AuthenticatedRequest, @Query("active") active?: string) {
    return this.cadastro.listTeams(getActor(req), parseBool(active));
  }

  @Post("teams")
  createTeam(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const data = teamSchema.parse(body);
    return this.cadastro.createTeam(getActor(req), data);
  }

  @Get("teams/:id")
  getTeam(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.cadastro.getTeam(getActor(req), id);
  }

  @Put("teams/:id")
  updateTeam(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const data = teamUpdateSchema.parse(body);
    return this.cadastro.updateTeam(getActor(req), id, data);
  }

  @Delete("teams/:id")
  deleteTeam(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.cadastro.deleteTeam(getActor(req), id);
  }

  // ── TeamFunctions ───────────────────────────────────────

  @Get("teams/:teamId/functions")
  listFunctions(
    @Req() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
  ) {
    return this.cadastro.listFunctions(getActor(req), teamId);
  }

  @Post("teams/:teamId/functions")
  createFunction(
    @Req() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Body() body: unknown,
  ) {
    const data = teamFunctionSchema.parse(body);
    return this.cadastro.createFunction(getActor(req), teamId, data);
  }

  @Put("functions/:id")
  updateFunction(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const data = teamFunctionUpdateSchema.parse(body);
    return this.cadastro.updateFunction(getActor(req), id, data);
  }

  @Delete("functions/:id")
  deleteFunction(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.cadastro.deleteFunction(getActor(req), id);
  }

  // ── Members ─────────────────────────────────────────────

  @Get("members")
  listMembers(
    @Req() req: AuthenticatedRequest,
    @Query("q") q?: string,
    @Query("teamId") teamId?: string,
    @Query("active") active?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.cadastro.listMembers(getActor(req), {
      q,
      teamId,
      active: parseBool(active),
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post("members")
  createMember(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const data = memberSchema.parse(body);
    return this.cadastro.createMember(getActor(req), data);
  }

  @Get("members/:id")
  getMember(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.cadastro.getMember(getActor(req), id);
  }

  @Put("members/:id")
  updateMember(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const data = memberUpdateSchema.parse(body);
    return this.cadastro.updateMember(getActor(req), id, data);
  }

  @Delete("members/:id")
  deleteMember(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.cadastro.deleteMember(getActor(req), id);
  }

  // ── TeamMemberships ─────────────────────────────────────

  @Get("teams/:teamId/members")
  listTeamMembers(
    @Req() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
  ) {
    return this.cadastro.listTeamMembers(getActor(req), teamId);
  }

  @Post("teams/:teamId/members")
  createMembership(
    @Req() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Body() body: unknown,
  ) {
    const data = teamMembershipSchema.parse(body);
    return this.cadastro.createMembership(getActor(req), teamId, data);
  }

  @Put("memberships/:id")
  updateMembership(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const data = teamMembershipUpdateSchema.parse(body);
    return this.cadastro.updateMembership(getActor(req), id, data);
  }

  @Delete("memberships/:id")
  deleteMembership(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.cadastro.deleteMembership(getActor(req), id);
  }

  // ── MembershipFunctions (qualificações) ─────────────────

  @Get("memberships/:id/functions")
  getMembershipFunctions(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.cadastro.getMembershipFunctions(getActor(req), id);
  }

  @Put("memberships/:id/functions")
  setMembershipFunctions(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const data = membershipFunctionsSchema.parse(body);
    return this.cadastro.setMembershipFunctions(
      getActor(req),
      id,
      data.functionIds,
    );
  }

  // ── StaffingRequirements (demanda) ──────────────────────

  @Get("teams/:teamId/staffing")
  listStaffing(
    @Req() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
  ) {
    return this.cadastro.listStaffing(getActor(req), teamId);
  }

  @Post("teams/:teamId/staffing")
  createStaffing(
    @Req() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Body() body: unknown,
  ) {
    const data = staffingRequirementCreateSchema.parse(body);
    return this.cadastro.createStaffing(getActor(req), teamId, data);
  }

  @Put("staffing/:id")
  updateStaffing(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const data = staffingRequirementSchema.parse(body);
    return this.cadastro.updateStaffing(getActor(req), id, data);
  }

  @Delete("staffing/:id")
  deleteStaffing(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.cadastro.deleteStaffing(getActor(req), id);
  }
}
