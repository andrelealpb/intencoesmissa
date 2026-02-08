-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'PARISH_ADMIN');

-- CreateEnum
CREATE TYPE "IntentionGroup" AS ENUM ('SUFRAGIO', 'SUPLICAS', 'ACAO_DE_GRACAS');

-- CreateEnum
CREATE TYPE "DispatchScope" AS ENUM ('PER_MASS', 'PER_DAY');

-- CreateEnum
CREATE TYPE "EmolumentScope" AS ENUM ('DEFAULT', 'GROUP', 'TYPE');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('SUBMITTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "parishes" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "cnpj" TEXT,
    "legal_name" TEXT,
    "parish_name" TEXT NOT NULL,
    "pastor_name" TEXT,
    "address_json" JSONB,
    "phones_json" JSONB,
    "dispatch_emails" TEXT[],
    "logo_url" TEXT,
    "logo_storage_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parishes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "parish_id" UUID,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parish_settings" (
    "parish_id" UUID NOT NULL,
    "max_intentions_per_request" INTEGER NOT NULL DEFAULT 5,
    "dispatch_time" TEXT NOT NULL DEFAULT '18:00',
    "dispatch_scope" "DispatchScope" NOT NULL DEFAULT 'PER_MASS',
    "dispatch_timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',

    CONSTRAINT "parish_settings_pkey" PRIMARY KEY ("parish_id")
);

-- CreateTable
CREATE TABLE "mass_schedules" (
    "id" UUID NOT NULL,
    "parish_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "time" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "mass_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mass_exceptions" (
    "id" UUID NOT NULL,
    "parish_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT NOT NULL,
    "title" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "mass_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intention_types" (
    "id" UUID NOT NULL,
    "parish_id" UUID NOT NULL,
    "group" "IntentionGroup" NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "requires_deceased_name" BOOLEAN NOT NULL DEFAULT false,
    "requires_family_names" BOOLEAN NOT NULL DEFAULT false,
    "opens_optional_notes" BOOLEAN NOT NULL DEFAULT false,
    "requires_complement" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "intention_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emoluments" (
    "id" UUID NOT NULL,
    "parish_id" UUID NOT NULL,
    "scope" "EmolumentScope" NOT NULL,
    "group" "IntentionGroup",
    "intention_type_id" UUID,
    "suggested_value" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "emoluments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requests" (
    "id" UUID NOT NULL,
    "parish_id" UUID NOT NULL,
    "protocol" TEXT NOT NULL,
    "mass_date" DATE NOT NULL,
    "mass_time" TEXT NOT NULL,
    "faithful_name" TEXT NOT NULL,
    "faithful_phone" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_intentions" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "group" "IntentionGroup" NOT NULL,
    "intention_type_id" UUID NOT NULL,
    "deceased_name" TEXT,
    "family_names" TEXT,
    "complement" TEXT,
    "notes" TEXT,
    "suggested_value" DECIMAL(10,2),
    "offered_value" DECIMAL(10,2),
    "dispatched_at" TIMESTAMP(3),
    "dispatch_batch_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_intentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_batches" (
    "id" UUID NOT NULL,
    "parish_id" UUID NOT NULL,
    "scope" "DispatchScope" NOT NULL,
    "mass_date" DATE NOT NULL,
    "mass_time" TEXT,
    "pdf_storage_key" TEXT NOT NULL,
    "pdf_url" TEXT,
    "sent_to_emails" TEXT[],
    "sent_at" TIMESTAMP(3) NOT NULL,
    "status" "DispatchStatus" NOT NULL,
    "error_message" TEXT,

    CONSTRAINT "dispatch_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parishes_slug_key" ON "parishes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "requests_parish_id_protocol_key" ON "requests"("parish_id", "protocol");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_parish_id_fkey" FOREIGN KEY ("parish_id") REFERENCES "parishes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parish_settings" ADD CONSTRAINT "parish_settings_parish_id_fkey" FOREIGN KEY ("parish_id") REFERENCES "parishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mass_schedules" ADD CONSTRAINT "mass_schedules_parish_id_fkey" FOREIGN KEY ("parish_id") REFERENCES "parishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mass_exceptions" ADD CONSTRAINT "mass_exceptions_parish_id_fkey" FOREIGN KEY ("parish_id") REFERENCES "parishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intention_types" ADD CONSTRAINT "intention_types_parish_id_fkey" FOREIGN KEY ("parish_id") REFERENCES "parishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emoluments" ADD CONSTRAINT "emoluments_parish_id_fkey" FOREIGN KEY ("parish_id") REFERENCES "parishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emoluments" ADD CONSTRAINT "emoluments_intention_type_id_fkey" FOREIGN KEY ("intention_type_id") REFERENCES "intention_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_parish_id_fkey" FOREIGN KEY ("parish_id") REFERENCES "parishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_intentions" ADD CONSTRAINT "request_intentions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_intentions" ADD CONSTRAINT "request_intentions_intention_type_id_fkey" FOREIGN KEY ("intention_type_id") REFERENCES "intention_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_intentions" ADD CONSTRAINT "request_intentions_dispatch_batch_id_fkey" FOREIGN KEY ("dispatch_batch_id") REFERENCES "dispatch_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_batches" ADD CONSTRAINT "dispatch_batches_parish_id_fkey" FOREIGN KEY ("parish_id") REFERENCES "parishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
