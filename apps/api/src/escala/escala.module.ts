import { Module } from "@nestjs/common";
import { EscalaController } from "./escala.controller";
import { OccurrenceService } from "./occurrence.service";

/**
 * Modulo Escala (bounded context separado). S2 entrega apenas a materializacao
 * de ocorrencias; cadastro/auth/portal entram em sessoes seguintes.
 */
@Module({
  controllers: [EscalaController],
  providers: [OccurrenceService],
  exports: [OccurrenceService],
})
export class EscalaModule {}
