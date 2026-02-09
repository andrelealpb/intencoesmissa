-- Replace dispatchTime with dispatchMinutesBefore
ALTER TABLE "parish_settings" ADD COLUMN "dispatch_minutes_before" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "parish_settings" DROP COLUMN IF EXISTS "dispatch_time";
