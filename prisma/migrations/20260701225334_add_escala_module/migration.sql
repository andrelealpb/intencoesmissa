-- CreateEnum
CREATE TYPE "MinistryCategory" AS ENUM ('ALTAR_SERVERS', 'EUCHARISTIC_MINISTERS', 'READERS', 'COMMENTATORS', 'WELCOMING', 'TITHE', 'MUSIC', 'COLLECTION', 'DECORATION', 'SPECIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "StaffingScope" AS ENUM ('DEFAULT', 'WEEKDAY', 'SCHEDULE', 'SOLEMNITY', 'OCCASION');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'MAYBE');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MemberAuthTokenType" AS ENUM ('MAGIC_LINK', 'OTP');

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL,
    "parish_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "birth_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "parish_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "MinistryCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_functions" (
    "id" UUID NOT NULL,
    "parish_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_functions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_memberships" (
    "id" UUID NOT NULL,
    "parish_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "is_coordinator" BOOLEAN NOT NULL DEFAULT false,
    "max_assignments_per_month" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_functions" (
    "id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "function_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_functions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mass_occurrences" (
    "id" UUID NOT NULL,
    "parish_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT NOT NULL,
    "title" TEXT,
    "is_solemnity" BOOLEAN NOT NULL DEFAULT false,
    "source_schedule_id" UUID,
    "source_exception_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mass_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staffing_requirements" (
    "id" UUID NOT NULL,
    "parish_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "function_id" UUID NOT NULL,
    "required_count" INTEGER NOT NULL,
    "scope" "StaffingScope" NOT NULL DEFAULT 'DEFAULT',
    "weekday" INTEGER,
    "mass_schedule_id" UUID,
    "mass_exception_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staffing_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_availability_rules" (
    "id" UUID NOT NULL,
    "parish_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "time" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_entries" (
    "id" UUID NOT NULL,
    "parish_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "occurrence_id" UUID NOT NULL,
    "status" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "note" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "availability_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "parish_id" UUID NOT NULL,
    "occurrence_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "function_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "published_at" TIMESTAMP(3),
    "assigned_by_user_id" UUID,
    "assigned_by_member_id" UUID,
    "note" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_auth_tokens" (
    "id" UUID NOT NULL,
    "parish_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "type" "MemberAuthTokenType" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "members_parish_id_is_active_idx" ON "members"("parish_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "teams_parish_id_name_key" ON "teams"("parish_id", "name");

-- CreateIndex
CREATE INDEX "team_functions_parish_id_idx" ON "team_functions"("parish_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_functions_team_id_name_key" ON "team_functions"("team_id", "name");

-- CreateIndex
CREATE INDEX "team_memberships_parish_id_idx" ON "team_memberships"("parish_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_memberships_team_id_member_id_key" ON "team_memberships"("team_id", "member_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_functions_membership_id_function_id_key" ON "membership_functions"("membership_id", "function_id");

-- CreateIndex
CREATE INDEX "mass_occurrences_parish_id_date_idx" ON "mass_occurrences"("parish_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "mass_occurrences_parish_id_date_time_key" ON "mass_occurrences"("parish_id", "date", "time");

-- CreateIndex
CREATE INDEX "staffing_requirements_parish_id_team_id_function_id_idx" ON "staffing_requirements"("parish_id", "team_id", "function_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_availability_rules_member_id_weekday_time_key" ON "member_availability_rules"("member_id", "weekday", "time");

-- CreateIndex
CREATE INDEX "availability_entries_occurrence_id_status_idx" ON "availability_entries"("occurrence_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "availability_entries_member_id_occurrence_id_key" ON "availability_entries"("member_id", "occurrence_id");

-- CreateIndex
CREATE INDEX "assignments_occurrence_id_function_id_idx" ON "assignments"("occurrence_id", "function_id");

-- CreateIndex
CREATE INDEX "assignments_parish_id_team_id_idx" ON "assignments"("parish_id", "team_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_occurrence_id_member_id_key" ON "assignments"("occurrence_id", "member_id");

-- CreateIndex
CREATE INDEX "member_auth_tokens_token_hash_idx" ON "member_auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "member_auth_tokens_member_id_idx" ON "member_auth_tokens"("member_id");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_parish_id_fkey" FOREIGN KEY ("parish_id") REFERENCES "parishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_parish_id_fkey" FOREIGN KEY ("parish_id") REFERENCES "parishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_functions" ADD CONSTRAINT "team_functions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_functions" ADD CONSTRAINT "membership_functions_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "team_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_functions" ADD CONSTRAINT "membership_functions_function_id_fkey" FOREIGN KEY ("function_id") REFERENCES "team_functions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mass_occurrences" ADD CONSTRAINT "mass_occurrences_parish_id_fkey" FOREIGN KEY ("parish_id") REFERENCES "parishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mass_occurrences" ADD CONSTRAINT "mass_occurrences_source_schedule_id_fkey" FOREIGN KEY ("source_schedule_id") REFERENCES "mass_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mass_occurrences" ADD CONSTRAINT "mass_occurrences_source_exception_id_fkey" FOREIGN KEY ("source_exception_id") REFERENCES "mass_exceptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffing_requirements" ADD CONSTRAINT "staffing_requirements_parish_id_fkey" FOREIGN KEY ("parish_id") REFERENCES "parishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffing_requirements" ADD CONSTRAINT "staffing_requirements_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffing_requirements" ADD CONSTRAINT "staffing_requirements_function_id_fkey" FOREIGN KEY ("function_id") REFERENCES "team_functions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffing_requirements" ADD CONSTRAINT "staffing_requirements_mass_schedule_id_fkey" FOREIGN KEY ("mass_schedule_id") REFERENCES "mass_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffing_requirements" ADD CONSTRAINT "staffing_requirements_mass_exception_id_fkey" FOREIGN KEY ("mass_exception_id") REFERENCES "mass_exceptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_availability_rules" ADD CONSTRAINT "member_availability_rules_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_entries" ADD CONSTRAINT "availability_entries_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_entries" ADD CONSTRAINT "availability_entries_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "mass_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_parish_id_fkey" FOREIGN KEY ("parish_id") REFERENCES "parishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "mass_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_function_id_fkey" FOREIGN KEY ("function_id") REFERENCES "team_functions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_auth_tokens" ADD CONSTRAINT "member_auth_tokens_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
