-- S5 (auth de membro): contador de tentativas de verificação do OTP.
-- Puramente aditiva — só ADD COLUMN na tabela da Escala `member_auth_tokens`.
-- Nenhum ALTER/DROP em tabelas de Intenções.
ALTER TABLE "member_auth_tokens" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
