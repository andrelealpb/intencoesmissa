import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../prisma/prisma.service";
import { memberAuthConfig } from "./member-auth.config";

interface MemberJwtPayload {
  sub: string;
  parishId: string;
  realm: string;
}

/**
 * Realm de MEMBRO (D1). Estratégia Passport nomeada `member-jwt`, com secret
 * (`MEMBER_JWT_SECRET`) e claim `realm: 'member'` separados do admin — o
 * `JwtStrategy` do admin **nunca** aceita este token e vice-versa.
 *
 * `validate` **recarrega o Member do banco** e exige `isActive` (revogação
 * imediata). A autorização de coordenador NÃO sai daqui — é lida do banco no
 * `EscalaAccessService` a cada request.
 */
@Injectable()
export class MemberJwtStrategy extends PassportStrategy(Strategy, "member-jwt") {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: memberAuthConfig.jwtSecret,
    });
  }

  async validate(payload: MemberJwtPayload) {
    if (payload.realm !== "member") {
      throw new UnauthorizedException("Token de realm invalido");
    }

    const member = await this.prisma.member.findUnique({
      where: { id: payload.sub },
    });

    if (!member || !member.isActive) {
      throw new UnauthorizedException("Membro inativo ou nao encontrado");
    }

    return {
      id: member.id,
      parishId: member.parishId,
      realm: "member" as const,
    };
  }
}
