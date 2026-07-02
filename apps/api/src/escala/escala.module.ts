import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AdminModule } from "../admin/admin.module";
import { EscalaController } from "./escala.controller";
import { OccurrenceService } from "./occurrence.service";
import { CadastroController } from "./cadastro.controller";
import { CadastroService } from "./cadastro.service";
import { EscalaAccessService } from "./escala-access.service";
import { MemberAuthController } from "./auth/member-auth.controller";
import { MemberAuthService } from "./auth/member-auth.service";
import { MemberAuthTokenService } from "./auth/member-auth-token.service";
import { MemberAuthDeliveryService } from "./auth/member-auth-delivery.service";
import { MemberJwtStrategy } from "./auth/member-jwt.strategy";
import { memberAuthConfig } from "./auth/member-auth.config";

/**
 * Modulo Escala (bounded context separado).
 * - S2: materializacao de ocorrencias.
 * - S3: cadastro backend (equipes, funcoes, membros, vinculos, qualificacoes,
 *   demanda).
 * - S5: realm de auth de membro (OTP/link magico), JWT de membro isolado
 *   (`MEMBER_JWT_SECRET`), guard composto e ramo de coordenador ativado no
 *   `EscalaAccessService` (autorizacao lida do banco).
 *
 * O `JwtModule` local assina/verifica o JWT de MEMBRO com secret proprio,
 * scopeado a este modulo — nunca colide com o `JwtService` do admin (D1).
 * `AdminModule` e reusado pelos servicos de entrega (WhatsApp/Brevo).
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: memberAuthConfig.jwtSecret,
      signOptions: { expiresIn: memberAuthConfig.jwtTtl },
    }),
    AdminModule,
  ],
  controllers: [EscalaController, CadastroController, MemberAuthController],
  providers: [
    OccurrenceService,
    CadastroService,
    EscalaAccessService,
    MemberAuthService,
    MemberAuthTokenService,
    MemberAuthDeliveryService,
    MemberJwtStrategy,
  ],
  exports: [OccurrenceService, EscalaAccessService],
})
export class EscalaModule {}
