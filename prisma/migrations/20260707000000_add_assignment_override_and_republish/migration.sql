-- S8 (backend de montagem — tela do coordenador): suporte a override manual
-- consciente (V2) e à detecção de mudança pós-publicação (V4).
--
-- Puramente aditiva — só ADD COLUMN na tabela da Escala `assignments`.
-- Nenhum ALTER/DROP em tabelas de Intenções (D9 / Seção 1.1).
--
--  * override_reason  — justificativa quando um membro inelegível
--                       (indisponível / no teto / não qualificado) é escalado
--                       à mão pelo coordenador (V2).
--  * republished_at   — "selo" da última publicação da (equipe, mês). Publicar
--                       carimba published_at (se nulo) e republished_at em todos
--                       os assignments vivos do conjunto. Uma alteração posterior
--                       (updated_at > republished_at) ou um rascunho novo
--                       (published_at = null) torna a mudança detectável sem
--                       tabela de auditoria (base do aviso da S9).
ALTER TABLE "assignments" ADD COLUMN "republished_at" TIMESTAMP(3);
ALTER TABLE "assignments" ADD COLUMN "override_reason" TEXT;
