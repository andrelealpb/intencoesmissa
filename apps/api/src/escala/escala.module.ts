import { Module } from "@nestjs/common";
import { EscalaController } from "./escala.controller";
import { OccurrenceService } from "./occurrence.service";
import { CadastroController } from "./cadastro.controller";
import { CadastroService } from "./cadastro.service";
import { EscalaAccessService } from "./escala-access.service";

/**
 * Modulo Escala (bounded context separado). S2: materializacao de ocorrencias.
 * S3: cadastro backend (equipes, funcoes, membros, vinculos, qualificacoes,
 * demanda) admin-only, com a costura de autorizacao (`EscalaAccessService`)
 * pronta para o coordenador (TODO S5).
 */
@Module({
  controllers: [EscalaController, CadastroController],
  providers: [OccurrenceService, CadastroService, EscalaAccessService],
  exports: [OccurrenceService, EscalaAccessService],
})
export class EscalaModule {}
