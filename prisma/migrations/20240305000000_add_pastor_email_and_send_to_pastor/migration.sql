-- Add pastor_email to parishes
ALTER TABLE "parishes" ADD COLUMN "pastor_email" TEXT;

-- Add send_to_pastor flag to intention_types
ALTER TABLE "intention_types" ADD COLUMN "send_to_pastor" BOOLEAN NOT NULL DEFAULT false;
