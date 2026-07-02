import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { StaffingScope } from "@missas/shared";
import type {
  TeamInput,
  TeamUpdateInput,
  TeamFunctionInput,
  TeamFunctionUpdateInput,
  MemberInput,
  MemberUpdateInput,
  TeamMembershipInput,
  TeamMembershipUpdateInput,
  StaffingRequirementInput,
  StaffingRequirementCreateInput,
} from "@missas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { EscalaAccessService, type AdminActor } from "./escala-access.service";

interface MemberListQuery {
  q?: string;
  teamId?: string;
  active?: boolean;
  page?: number;
  pageSize?: number;
}

/**
 * Cadastro backend do módulo Escala (S3): equipes, funções, membros, vínculos,
 * qualificações e demanda. Admin-only nesta fase — a via de coordenador é
 * preparada em `EscalaAccessService` (TODO S5) mas ainda inativa.
 *
 * Toda operação passa pela costura de autorização (`EscalaAccessService`) e
 * usa o `parishId` derivado do ator (JWT), nunca do body.
 */
@Injectable()
export class CadastroService {
  constructor(
    private prisma: PrismaService,
    private access: EscalaAccessService,
  ) {}

  // ── Teams ───────────────────────────────────────────────

  async listTeams(actor: AdminActor, active?: boolean) {
    const parishId = this.access.assertCanManageParish(actor);
    return this.prisma.team.findMany({
      where: { parishId, ...(active === undefined ? {} : { isActive: active }) },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        _count: { select: { memberships: true, functions: true } },
      },
    });
  }

  async createTeam(actor: AdminActor, data: TeamInput) {
    const parishId = this.access.assertCanManageParish(actor);
    try {
      return await this.prisma.team.create({
        data: {
          parishId,
          name: data.name,
          category: data.category,
          description: data.description ?? null,
        },
      });
    } catch (err) {
      throw this.translateUnique(err, "Ja existe uma equipe com este nome");
    }
  }

  async getTeam(actor: AdminActor, id: string) {
    const parishId = await this.access.assertCanManageTeam(actor, id);
    const team = await this.prisma.team.findFirst({
      where: { id, parishId },
      include: {
        functions: { orderBy: { sortOrder: "asc" } },
        _count: { select: { memberships: true } },
      },
    });
    if (!team) throw new NotFoundException("Equipe nao encontrada");
    return team;
  }

  async updateTeam(actor: AdminActor, id: string, data: TeamUpdateInput) {
    await this.access.assertCanManageTeam(actor, id);
    try {
      return await this.prisma.team.update({
        where: { id },
        data: {
          name: data.name,
          category: data.category,
          description: data.description ?? null,
          ...(data.isActive === undefined ? {} : { isActive: data.isActive }),
        },
      });
    } catch (err) {
      throw this.translateUnique(err, "Ja existe uma equipe com este nome");
    }
  }

  async deleteTeam(actor: AdminActor, id: string) {
    await this.access.assertCanManageTeam(actor, id);
    const [memberships, assignments] = await Promise.all([
      this.prisma.teamMembership.count({ where: { teamId: id } }),
      this.prisma.assignment.count({ where: { teamId: id } }),
    ]);
    if (memberships > 0 || assignments > 0) {
      // Histórico/vínculos existentes → soft-delete (preserva referências).
      return this.prisma.team.update({
        where: { id },
        data: { isActive: false },
      });
    }
    return this.prisma.team.delete({ where: { id } });
  }

  // ── TeamFunctions ───────────────────────────────────────

  async listFunctions(actor: AdminActor, teamId: string) {
    await this.access.assertCanManageTeam(actor, teamId);
    return this.prisma.teamFunction.findMany({
      where: { teamId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  async createFunction(
    actor: AdminActor,
    teamId: string,
    data: TeamFunctionInput,
  ) {
    const parishId = await this.access.assertCanManageTeam(actor, teamId);
    try {
      return await this.prisma.teamFunction.create({
        data: {
          parishId,
          teamId,
          name: data.name,
          description: data.description ?? null,
          sortOrder: data.sortOrder ?? 0,
        },
      });
    } catch (err) {
      throw this.translateUnique(
        err,
        "Ja existe uma funcao com este nome nesta equipe",
      );
    }
  }

  async updateFunction(
    actor: AdminActor,
    id: string,
    data: TeamFunctionUpdateInput,
  ) {
    const fn = await this.loadFunctionForActor(actor, id);
    try {
      return await this.prisma.teamFunction.update({
        where: { id: fn.id },
        data: {
          name: data.name,
          description: data.description ?? null,
          ...(data.sortOrder === undefined ? {} : { sortOrder: data.sortOrder }),
          ...(data.isActive === undefined ? {} : { isActive: data.isActive }),
        },
      });
    } catch (err) {
      throw this.translateUnique(
        err,
        "Ja existe uma funcao com este nome nesta equipe",
      );
    }
  }

  async deleteFunction(actor: AdminActor, id: string) {
    const fn = await this.loadFunctionForActor(actor, id);
    const [quals, staffing, assignments] = await Promise.all([
      this.prisma.membershipFunction.count({ where: { functionId: fn.id } }),
      this.prisma.staffingRequirement.count({ where: { functionId: fn.id } }),
      this.prisma.assignment.count({ where: { functionId: fn.id } }),
    ]);
    if (quals > 0 || staffing > 0 || assignments > 0) {
      return this.prisma.teamFunction.update({
        where: { id: fn.id },
        data: { isActive: false },
      });
    }
    return this.prisma.teamFunction.delete({ where: { id: fn.id } });
  }

  // ── Members (nível paróquia) ────────────────────────────

  async listMembers(actor: AdminActor, query: MemberListQuery) {
    const parishId = this.access.assertCanManageParish(actor);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));

    const where: Prisma.MemberWhereInput = {
      parishId,
      ...(query.active === undefined ? {} : { isActive: query.active }),
      ...(query.q
        ? { fullName: { contains: query.q, mode: "insensitive" } }
        : {}),
      ...(query.teamId
        ? { memberships: { some: { teamId: query.teamId } } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        orderBy: { fullName: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { memberships: true } } },
      }),
      this.prisma.member.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async createMember(actor: AdminActor, data: MemberInput) {
    const parishId = this.access.assertCanManageParish(actor);

    // Sem unique em phone (público grande, homônimos comuns). Se já houver
    // membro com o mesmo telefone na paróquia, avisar sem bloquear.
    const duplicateCount = await this.prisma.member.count({
      where: { parishId, phone: data.phone },
    });

    const member = await this.prisma.member.create({
      data: {
        parishId,
        fullName: data.fullName,
        phone: data.phone,
        email: data.email ? data.email : null,
        birthDate: data.birthDate
          ? new Date(data.birthDate + "T00:00:00Z")
          : null,
      },
    });

    if (duplicateCount > 0) {
      return {
        ...member,
        warning:
          "Ja existe um membro com este telefone nesta paroquia (possivel duplicata).",
      };
    }
    return member;
  }

  async getMember(actor: AdminActor, id: string) {
    const parishId = this.access.assertCanManageParish(actor);
    const member = await this.prisma.member.findFirst({
      where: { id, parishId },
      include: {
        memberships: {
          include: {
            team: { select: { id: true, name: true, category: true } },
            qualifications: { select: { functionId: true } },
          },
        },
      },
    });
    if (!member) throw new NotFoundException("Membro nao encontrado");
    return member;
  }

  async updateMember(actor: AdminActor, id: string, data: MemberUpdateInput) {
    const parishId = this.access.assertCanManageParish(actor);
    await this.ensureMemberOwnership(parishId, id);
    return this.prisma.member.update({
      where: { id },
      data: {
        fullName: data.fullName,
        phone: data.phone,
        email: data.email ? data.email : null,
        birthDate: data.birthDate
          ? new Date(data.birthDate + "T00:00:00Z")
          : null,
        ...(data.isActive === undefined ? {} : { isActive: data.isActive }),
      },
    });
  }

  async deleteMember(actor: AdminActor, id: string) {
    const parishId = this.access.assertCanManageParish(actor);
    await this.ensureMemberOwnership(parishId, id);
    // Membros têm histórico de assignment → sempre soft-delete (nunca apagar
    // fisicamente uma pessoa que já foi escalada).
    return this.prisma.member.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ── TeamMemberships (vínculos) ──────────────────────────

  async listTeamMembers(actor: AdminActor, teamId: string) {
    await this.access.assertCanManageTeam(actor, teamId);
    return this.prisma.teamMembership.findMany({
      where: { teamId },
      orderBy: [{ isActive: "desc" }, { priority: "asc" }],
      include: {
        member: {
          select: { id: true, fullName: true, phone: true, isActive: true },
        },
        qualifications: { select: { functionId: true } },
      },
    });
  }

  async createMembership(
    actor: AdminActor,
    teamId: string,
    data: TeamMembershipInput,
  ) {
    const parishId = await this.access.assertCanManageTeam(actor, teamId);

    // O membro precisa existir e pertencer à mesma paróquia.
    await this.ensureMemberOwnership(parishId, data.memberId);

    try {
      return await this.prisma.teamMembership.create({
        data: {
          parishId,
          teamId,
          memberId: data.memberId,
          isCoordinator: data.isCoordinator ?? false,
          maxAssignmentsPerMonth: data.maxAssignmentsPerMonth ?? null,
          ...(data.priority === undefined ? {} : { priority: data.priority }),
        },
      });
    } catch (err) {
      throw this.translateUnique(
        err,
        "Este membro ja esta vinculado a esta equipe",
      );
    }
  }

  async updateMembership(
    actor: AdminActor,
    id: string,
    data: TeamMembershipUpdateInput,
  ) {
    const membership = await this.loadMembershipForActor(actor, id);
    return this.prisma.teamMembership.update({
      where: { id: membership.id },
      data: {
        ...(data.isCoordinator === undefined
          ? {}
          : { isCoordinator: data.isCoordinator }),
        ...(data.maxAssignmentsPerMonth === undefined
          ? {}
          : { maxAssignmentsPerMonth: data.maxAssignmentsPerMonth }),
        ...(data.priority === undefined ? {} : { priority: data.priority }),
        ...(data.isActive === undefined ? {} : { isActive: data.isActive }),
      },
    });
  }

  async deleteMembership(actor: AdminActor, id: string) {
    const membership = await this.loadMembershipForActor(actor, id);
    const assignments = await this.prisma.assignment.count({
      where: { teamId: membership.teamId, memberId: membership.memberId },
    });
    if (assignments > 0) {
      return this.prisma.teamMembership.update({
        where: { id: membership.id },
        data: { isActive: false },
      });
    }
    return this.prisma.teamMembership.delete({ where: { id: membership.id } });
  }

  // ── MembershipFunctions (qualificações — replace-set) ───

  async getMembershipFunctions(actor: AdminActor, membershipId: string) {
    const membership = await this.loadMembershipForActor(actor, membershipId);
    const rows = await this.prisma.membershipFunction.findMany({
      where: { membershipId: membership.id },
      select: { functionId: true },
    });
    return { functionIds: rows.map((r) => r.functionId) };
  }

  async setMembershipFunctions(
    actor: AdminActor,
    membershipId: string,
    functionIds: string[],
  ) {
    const membership = await this.loadMembershipForActor(actor, membershipId);
    const uniqueIds = [...new Set(functionIds)];

    if (uniqueIds.length > 0) {
      // Cada função precisa pertencer à equipe do membership (senão 400).
      const valid = await this.prisma.teamFunction.count({
        where: { id: { in: uniqueIds }, teamId: membership.teamId },
      });
      if (valid !== uniqueIds.length) {
        throw new BadRequestException(
          "Uma ou mais funcoes nao pertencem a equipe deste membro",
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.membershipFunction.deleteMany({
        where: { membershipId: membership.id },
      }),
      ...(uniqueIds.length > 0
        ? [
            this.prisma.membershipFunction.createMany({
              data: uniqueIds.map((functionId) => ({
                membershipId: membership.id,
                functionId,
              })),
            }),
          ]
        : []),
    ]);

    return { functionIds: uniqueIds };
  }

  // ── StaffingRequirements (demanda) ──────────────────────

  async listStaffing(actor: AdminActor, teamId: string) {
    await this.access.assertCanManageTeam(actor, teamId);
    return this.prisma.staffingRequirement.findMany({
      where: { teamId },
      orderBy: [{ functionId: "asc" }, { scope: "asc" }],
      include: {
        function: { select: { id: true, name: true } },
      },
    });
  }

  async createStaffing(
    actor: AdminActor,
    teamId: string,
    data: StaffingRequirementCreateInput,
  ) {
    const parishId = await this.access.assertCanManageTeam(actor, teamId);

    const fn = await this.prisma.teamFunction.findUnique({
      where: { id: data.functionId },
      select: { teamId: true },
    });
    if (!fn || fn.teamId !== teamId) {
      throw new BadRequestException("Funcao nao pertence a esta equipe");
    }

    await this.validateStaffingTarget(parishId, data);

    return this.prisma.staffingRequirement.create({
      data: {
        parishId,
        teamId,
        functionId: data.functionId,
        requiredCount: data.requiredCount,
        scope: data.scope,
        ...this.staffingTargetColumns(data),
        isActive: data.isActive ?? true,
      },
    });
  }

  async updateStaffing(
    actor: AdminActor,
    id: string,
    data: StaffingRequirementInput,
  ) {
    const existing = await this.prisma.staffingRequirement.findUnique({
      where: { id },
      select: { teamId: true },
    });
    if (!existing) throw new NotFoundException("Demanda nao encontrada");
    const parishId = await this.access.assertCanManageTeam(
      actor,
      existing.teamId,
    );

    await this.validateStaffingTarget(parishId, data);

    return this.prisma.staffingRequirement.update({
      where: { id },
      data: {
        requiredCount: data.requiredCount,
        scope: data.scope,
        ...this.staffingTargetColumns(data),
        ...(data.isActive === undefined ? {} : { isActive: data.isActive }),
      },
    });
  }

  async deleteStaffing(actor: AdminActor, id: string) {
    const existing = await this.prisma.staffingRequirement.findUnique({
      where: { id },
      select: { id: true, teamId: true },
    });
    if (!existing) throw new NotFoundException("Demanda nao encontrada");
    await this.access.assertCanManageTeam(actor, existing.teamId);
    // Regra de demanda não tem histórico próprio → hard-delete ok.
    return this.prisma.staffingRequirement.delete({
      where: { id: existing.id },
    });
  }

  // ── Helpers ─────────────────────────────────────────────

  private async loadFunctionForActor(actor: AdminActor, id: string) {
    const fn = await this.prisma.teamFunction.findUnique({
      where: { id },
      select: { id: true, teamId: true },
    });
    if (!fn) throw new NotFoundException("Funcao nao encontrada");
    await this.access.assertCanManageTeam(actor, fn.teamId);
    return fn;
  }

  private async loadMembershipForActor(actor: AdminActor, id: string) {
    const membership = await this.prisma.teamMembership.findUnique({
      where: { id },
      select: { id: true, teamId: true, memberId: true },
    });
    if (!membership) throw new NotFoundException("Vinculo nao encontrado");
    await this.access.assertCanManageTeam(actor, membership.teamId);
    return membership;
  }

  private async ensureMemberOwnership(parishId: string, memberId: string) {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { parishId: true },
    });
    if (!member || member.parishId !== parishId) {
      throw new NotFoundException("Membro nao encontrado");
    }
  }

  /**
   * Colunas de alvo derivadas do escopo — as incompatíveis vão a null (mesmo
   * num PUT que troca o escopo, garantindo que não sobra alvo antigo).
   */
  private staffingTargetColumns(data: {
    scope: StaffingScope;
    weekday?: number;
    massScheduleId?: string;
    massExceptionId?: string;
  }) {
    return {
      weekday: data.scope === StaffingScope.WEEKDAY ? data.weekday ?? null : null,
      massScheduleId:
        data.scope === StaffingScope.SCHEDULE
          ? data.massScheduleId ?? null
          : null,
      massExceptionId:
        data.scope === StaffingScope.OCCASION
          ? data.massExceptionId ?? null
          : null,
    };
  }

  private async validateStaffingTarget(
    parishId: string,
    data: {
      scope: StaffingScope;
      massScheduleId?: string;
      massExceptionId?: string;
    },
  ) {
    if (data.scope === StaffingScope.SCHEDULE && data.massScheduleId) {
      const schedule = await this.prisma.massSchedule.findUnique({
        where: { id: data.massScheduleId },
        select: { parishId: true },
      });
      if (!schedule || schedule.parishId !== parishId) {
        throw new BadRequestException("Horario nao pertence a esta paroquia");
      }
    }
    if (data.scope === StaffingScope.OCCASION && data.massExceptionId) {
      const exception = await this.prisma.massException.findUnique({
        where: { id: data.massExceptionId },
        select: { parishId: true },
      });
      if (!exception || exception.parishId !== parishId) {
        throw new BadRequestException("Excecao nao pertence a esta paroquia");
      }
    }
  }

  private translateUnique(err: unknown, message: string): Error {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return new ConflictException(message);
    }
    return err instanceof Error ? err : new Error(String(err));
  }
}
