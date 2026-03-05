-- AlterTable
ALTER TABLE "dispatch_batches" ADD COLUMN "sent_to_phones" TEXT[] DEFAULT ARRAY[]::TEXT[];
