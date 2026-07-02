import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * Guard do realm de MEMBRO. Valida o JWT `member-jwt` (secret separado), a
 * estratégia recarrega o `Member` e exige `isActive`. Anexa `req.member`.
 *
 * Não é usado por endpoint próprio na S5 (portal do membro é S6) — existe para
 * o realm ficar completo e para o portal consumi-lo. O `EscalaAuthGuard`
 * composto reusa a mesma estratégia `member-jwt`.
 */
@Injectable()
export class MemberJwtGuard extends AuthGuard("member-jwt") {
  handleRequest<TUser = unknown>(
    err: unknown,
    member: TUser,
    _info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err || !member) {
      throw err instanceof Error
        ? err
        : new UnauthorizedException("Nao autenticado como membro");
    }
    const req = context.switchToHttp().getRequest();
    req.member = member;
    return member;
  }
}
