-- AlterTable
ALTER TABLE "parishes" ADD COLUMN "dispatch_groups" TEXT[] DEFAULT ARRAY[]::TEXT[];
