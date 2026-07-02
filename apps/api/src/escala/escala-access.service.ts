import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Ator administrativo autenticado (realm User). Extraído do JWT pelo controller.
 * O realm de Membro (coordenador) é um segundo ator que chega em S5 (D1).
 */
export interface AdminActor {
  id: string;
  role: string;
  parishId: string | null;
}

/**
 * Costura de autorização do módulo Escala (D2).
 *
 * Hoje: só `User PARISH_ADMIN` dono da paróquia autoriza. O ponto de extensão
 * do coordenador (`Member` com `TeamMembership.isCoordinator=true` naquela
 * equipe) está marcado com `TODO(S5)` e só entra em vigor quando o realm de
 * membro existir (S5/S6). Os serviços chamam estes métodos em vez de embutir a
 * regra — quando o membro chegar, só este service muda.
 */
@Injectable()
export class EscalaAccessService {
  constructor(private prisma: PrismaService) {}

  /**
   * Autoriza operações no escopo da paróquia (recursos não ligados a uma
   * equipe específica, ex.: Member). Retorna o `parishId` efetivo do ator.
   */
  assertCanManageParish(actor: AdminActor): string {
    // TODO(S5): quando o realm de membro existir, um coordenador (Member) NÃO
    // deve passar aqui para recursos de paróquia — apenas para a própria equipe
    // (ver assertCanManageTeam). Este ramo permanece exclusivo do PARISH_ADMIN.
    if (actor.role !== "PARISH_ADMIN" || !actor.parishId) {
      throw new ForbiddenException("Acesso negado ao modulo Escala");
    }
    return actor.parishId;
  }

  /**
   * Autoriza operações sobre uma equipe específica. Garante que a equipe
   * pertence à paróquia do ator (404 caso contrário — não vaza existência).
   * Retorna o `parishId` efetivo do ator.
   */
  async assertCanManageTeam(
    actor: AdminActor,
    teamId: string,
  ): Promise<string> {
    // PARISH_ADMIN dono da paróquia → via ativa hoje.
    const parishId = this.assertCanManageParish(actor);

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { parishId: true },
    });
    if (!team || team.parishId !== parishId) {
      throw new NotFoundException("Equipe nao encontrada");
    }

    // TODO(S5): coordenador. Quando o realm de membro existir, autorizar também
    // um Member cujo TeamMembership desta equipe tenha isCoordinator=true —
    // limitado EXCLUSIVAMENTE a esta equipe (não a outras nem a recursos de
    // paróquia). A interface (actor + teamId) já está pronta para esse ramo;
    // nada além deste método precisa mudar.

    return parishId;
  }
}
