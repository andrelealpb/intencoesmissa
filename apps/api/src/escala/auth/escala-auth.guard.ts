import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { EscalaActor } from "../escala-access.service";

/**
 * Guard composto do módulo Escala (S5). Autentica **admin OU membro** e
 * normaliza para um `EscalaActor` em `req.actor`. Os controllers deixam a
 * decisão de acesso para o `EscalaAccessService` (que lê do banco):
 *
 * - `assertCanManageParish(actor)` → só admin passa (operações de paróquia).
 * - `assertCanManageTeam(actor, teamId)` → admin OU coordenador daquela equipe.
 *
 * Isolamento de realm (D1): cada estratégia tem secret próprio; um JWT de
 * membro nunca é aceito pela estratégia de admin e vice-versa. O `realm` no
 * payload é a última cerca (o membro carrega `realm: 'member'`).
 */
@Injectable()
export class EscalaAuthGuard implements CanActivate {
  private readonly adminGuard = new (AuthGuard("jwt"))();
  private readonly memberGuard = new (AuthGuard("member-jwt"))();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    // 1) Tenta o realm de admin (User PARISH_ADMIN etc.).
    if (await this.tryGuard(this.adminGuard, context)) {
      const user = req.user;
      // Um JWT de membro jamais chega aqui (secret/estratégia distintos), mas
      // barramos por via das dúvidas: admin não tem realm 'member'.
      if (user && user.realm !== "member") {
        req.actor = {
          kind: "admin",
          userId: user.id,
          role: user.role,
          parishId: user.parishId,
        } satisfies EscalaActor;
        return true;
      }
    }

    // 2) Tenta o realm de membro (coordenador/voluntário).
    if (await this.tryGuard(this.memberGuard, context)) {
      const member = req.user; // passport grava em req.user
      if (member && member.realm === "member") {
        req.member = member;
        req.actor = {
          kind: "member",
          memberId: member.id,
          parishId: member.parishId,
        } satisfies EscalaActor;
        return true;
      }
    }

    throw new UnauthorizedException("Nao autenticado");
  }

  private async tryGuard(
    guard: CanActivate,
    context: ExecutionContext,
  ): Promise<boolean> {
    try {
      return (await guard.canActivate(context)) === true;
    } catch {
      return false;
    }
  }
}
