-- S6.5 (Convites e Convocação): grupo de WhatsApp da equipe, destino da
-- convocação de disponibilidade na abertura do mês.
-- Puramente aditiva — só ADD COLUMN na tabela da Escala `teams`.
-- Nenhum ALTER/DROP em tabelas de Intenções.
ALTER TABLE "teams" ADD COLUMN "whatsapp_group_id" TEXT;
