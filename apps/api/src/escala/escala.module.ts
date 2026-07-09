import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AdminModule } from "../admin/admin.module";
import { EscalaController } from "./escala.controller";
import { OccurrenceController } from "./occurrence.controller";
import { OccurrenceService } from "./occurrence.service";
import { CadastroController } from "./cadastro.controller";
import { CadastroService } from "./cadastro.service";
import { EscalaAccessService } from "./escala-access.service";
import { EscalaNotifyService } from "./escala-notify.service";
import { ConvocationController } from "./convocation.controller";
import { ConvocationService } from "./convocation.service";
import { ScheduleController } from "./schedule.controller";
import { AssignmentController } from "./assignment.controller";
import { SuggestionService } from "./suggestion.service";
import { ScheduleService } from "./schedule.service";
import { MemberPortalController } from "./member-portal.controller";
import { AvailabilityService } from "./availability.service";
import { MemberAssignmentService } from "./member-assignment.service";
import { MemberAuthController } from "./auth/member-auth.controller";
import { MemberAuthService } from "./auth/member-auth.service";
import { MemberAuthTokenService } from "./auth/member-auth-token.service";
import { MemberAuthDeliveryService } from "./auth/member-auth-delivery.service";
import { MemberJwtStrategy } from "./auth/member-jwt.strategy";
import { memberAuthConfig } from "./auth/member-auth.config";

/**
 * Modulo Escala (bounded context separado).
 * - S2: materializacao de ocorrencias.
 * - S2.1: gestao do mes aberto (`OccurrenceController` sob `/escala/occurrences`,
 *   admin OU coordenador) — excluir ocorrencia avulsa (aviso+confirmacao se tem
 *   escala/disponibilidade, a exclusao cascateia) e RECONCILIAR o mes com o
 *   cadastro atual (orfa vazia sai direto; orfa com dado humano vira conflito).
 * - S3: cadastro backend (equipes, funcoes, membros, vinculos, qualificacoes,
 *   demanda).
 * - S5: realm de auth de membro (OTP/link magico), JWT de membro isolado
 *   (`MEMBER_JWT_SECRET`), guard composto e ramo de coordenador ativado no
 *   `EscalaAccessService` (autorizacao lida do banco).
 * - S6: portal do voluntario (`/escala/me/*` sob `MemberJwtGuard`) —
 *   disponibilidade efetiva via `resolveAvailability`, regras recorrentes.
 * - S6.5: convite individual no vinculo (`EscalaNotifyService`) + convocacao de
 *   grupo na abertura do mes (`ConvocationController`/`ConvocationService`),
 *   reusando a entrega Z-API. Materializacao segue independente do envio.
 * - S7: motor de sugestao (`ScheduleController`/`SuggestionService`) — rascunho
 *   guloso determinista via planner puro `planSchedule`, reusando
 *   `resolveStaffing` (S3) e `resolveAvailability` (S6).
 * - S8 (backend): endpoints de apoio da tela do coordenador —
 *   `ScheduleController.getGrid`/`publish` + `AssignmentController` sobre o
 *   `ScheduleService` e o puro `buildScheduleGrid` (grade + candidatos
 *   eligible/reason/conflict, override consciente V2, contenda V3, publicacao V4).
 * - S9: confirmacao pelo portal (`MemberAssignmentService`, GET/PUT
 *   `/escala/me/assignments` sob `MemberJwtGuard` — so o proprio/publicado). A
 *   recusa (DECLINED) reabre a lacuna na S8 (`getGrid` ignora DECLINED) e avisa o
 *   coordenador via `EscalaNotifyService`. O job de lembrete vive no worker
 *   (cron isolado — D9), fora deste modulo.
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
  controllers: [
    EscalaController,
    OccurrenceController,
    CadastroController,
    ConvocationController,
    ScheduleController,
    AssignmentController,
    MemberAuthController,
    MemberPortalController,
  ],
  providers: [
    OccurrenceService,
    CadastroService,
    EscalaAccessService,
    EscalaNotifyService,
    ConvocationService,
    SuggestionService,
    ScheduleService,
    AvailabilityService,
    MemberAssignmentService,
    MemberAuthService,
    MemberAuthTokenService,
    MemberAuthDeliveryService,
    MemberJwtStrategy,
  ],
  exports: [OccurrenceService, EscalaAccessService],
})
export class EscalaModule {}
