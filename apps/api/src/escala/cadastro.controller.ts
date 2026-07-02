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
  UnauthorizedException,
} from "@nestjs/common";
import { EscalaAuthGuard } from "./auth/escala-auth.guard";
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
import type { EscalaActor } from "./escala-access.service";

interface AuthenticatedRequest {
  // Normalizado pelo EscalaAuthGuard (admin OU membro).
  actor?: EscalaActor;
}

function getActor(req: AuthenticatedRequest): EscalaActor {
  if (!req.actor || !req.actor.parishId) {
    throw new UnauthorizedException("Ator nao autenticado");
  }
  return req.actor;
}

function parseBool(value?: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

/**
 * Cadastro backend do módulo Escala. Autenticado pelo `EscalaAuthGuard`
 * composto (admin OU membro). A decisão de acesso mora no `EscalaAccessService`
 * (a costura, lida do banco): operações de nível paróquia (Team, Member) só
 * passam para admin; operações de equipe (functions, memberships, qualificações,
 * staffing) passam também para o coordenador **daquela** equipe (matriz S5).
 *
 * Convive com o `EscalaController` (S2, ocorrências) sob o mesmo prefixo
 * `admin/escala`, em sub-rotas distintas.
 */
@Controller("admin/escala")
@UseGuards(EscalaAuthGuard)
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
