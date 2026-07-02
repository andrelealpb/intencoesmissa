import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Ator autenticado do módulo Escala, normalizado pelo `EscalaAuthGuard` a
 * partir de qualquer um dos dois realms (D1):
 * - `admin`  → `User` (JWT de admin), carrega `role`.
 * - `member` → `Member` (JWT de membro), pode ser coordenador de equipes.
 */
export interface EscalaActor {
  kind: "admin" | "member";
  userId?: string;
  memberId?: string;
  role?: string;
  parishId: string;
}

/** @deprecated Use `EscalaActor`. Mantido para compat de nomes na S3. */
export type AdminActor = EscalaActor;

/**
 * Costura de autorização do módulo Escala (D2). A regra é **lida do banco a
 * cada request** — se o pároco revogar `isCoordinator`, o efeito é imediato; o
 * JWT nunca é fonte de autorização.
 *
 * - `assertCanManageParish`: operações de nível paróquia → **só admin**.
 * - `assertCanManageTeam`: operações de uma equipe → admin **ou** coordenador
 *   ativo daquela equipe (e só daquela).
 */
@Injectable()
export class EscalaAccessService {
  constructor(private prisma: PrismaService) {}

  /**
   * Autoriza operações no escopo da paróquia (recursos não ligados a uma
   * equipe específica, ex.: Team, Member). **Exclusivo do admin** — um
   * coordenador (Member) nunca cria equipes nem pessoas. Retorna o `parishId`.
   */
  assertCanManageParish(actor: EscalaActor): string {
    if (actor.kind !== "admin" || actor.role !== "PARISH_ADMIN" || !actor.parishId) {
      throw new ForbiddenException("Acesso negado ao modulo Escala");
    }
    return actor.parishId;
  }

  /**
   * Autoriza operações sobre uma equipe específica. A equipe precisa pertencer
   * à paróquia do ator (404 caso contrário — não vaza existência). Coordenador
   * só passa na **própria** equipe (senão 403). Retorna o `parishId` efetivo.
   */
  async assertCanManageTeam(
    actor: EscalaActor,
    teamId: string,
  ): Promise<string> {
    if (!actor.parishId) {
      throw new ForbiddenException("Acesso negado ao modulo Escala");
    }

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { parishId: true },
    });
    if (!team || team.parishId !== actor.parishId) {
      throw new NotFoundException("Equipe nao encontrada");
    }

    // Admin PARISH_ADMIN dono da paróquia → autorizado em tudo.
    if (actor.kind === "admin") {
      if (actor.role !== "PARISH_ADMIN") {
        throw new ForbiddenException("Acesso negado ao modulo Escala");
      }
      return actor.parishId;
    }

    // Coordenador: vínculo verificado NO BANCO (não no JWT). Autoridade
    // limitada EXCLUSIVAMENTE a esta equipe.
    const coordinator = await this.prisma.teamMembership.findFirst({
      where: {
        teamId,
        memberId: actor.memberId,
        isCoordinator: true,
        isActive: true,
      },
      select: { id: true },
    });
    if (!coordinator) {
      throw new ForbiddenException("Voce nao coordena esta equipe");
    }

    return actor.parishId;
  }

  /** Verdadeiro só para o realm admin — usado por operações sensíveis de nível
   * equipe que ainda são exclusivas do admin (ex.: nomear coordenador). */
  isAdmin(actor: EscalaActor): boolean {
    return actor.kind === "admin" && actor.role === "PARISH_ADMIN";
  }
}
