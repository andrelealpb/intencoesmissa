-- S9 (Lembretes e Confirmação): tabela de idempotência de envio + config de
-- antecedências por paróquia.
--
-- Puramente aditiva:
--   * CREATE TYPE "ReminderKind"        — enum novo.
--   * CREATE TABLE "reminder_logs"      — tabela da Escala (dedupe do cron).
--   * ADD COLUMN em "parish_settings"   — 4 colunas de config, todas com default
--                                         (ou nullable). Só ADD COLUMN, nenhum
--                                         ALTER/DROP de coluna existente; o
--                                         despacho das Intenções não é afetado (D9).
-- Nenhum ALTER/DROP em tabelas de Intenções (parishes/notices/dispatch_batches/
-- requests/request_intentions).

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('GROUP_SUMMARY', 'INDIVIDUAL_EVE', 'INDIVIDUAL_DAY');

-- AlterTable (config de lembrete por paróquia — aditivo, com padrão)
ALTER TABLE "parish_settings" ADD COLUMN "reminders_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "parish_settings" ADD COLUMN "reminder_eve_hour" INTEGER NOT NULL DEFAULT 18;
ALTER TABLE "parish_settings" ADD COLUMN "reminder_same_day_hours_before" INTEGER;
ALTER TABLE "parish_settings" ADD COLUMN "reminder_group_summary_days_before" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "reminder_logs" (
    "id" UUID NOT NULL,
    "parish_id" UUID NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "target_key" TEXT NOT NULL,
    "assignment_id" UUID,
    "team_id" UUID,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "detail" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotência: 1 envio por (tipo, alvo))
CREATE UNIQUE INDEX "reminder_logs_kind_target_key_key" ON "reminder_logs"("kind", "target_key");

-- CreateIndex
CREATE INDEX "reminder_logs_parish_id_sent_at_idx" ON "reminder_logs"("parish_id", "sent_at");

-- AddForeignKey
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_parish_id_fkey" FOREIGN KEY ("parish_id") REFERENCES "parishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
