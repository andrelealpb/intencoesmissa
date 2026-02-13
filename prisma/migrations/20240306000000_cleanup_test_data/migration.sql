-- Cleanup all test request/dispatch data (one-time)
-- Keeps: parishes, users, intention types, mass schedules, emoluments, notices, settings

-- 1. Remove dispatch batch references from intentions
UPDATE "request_intentions" SET "dispatch_batch_id" = NULL WHERE "dispatch_batch_id" IS NOT NULL;

-- 2. Delete all dispatch batches
DELETE FROM "dispatch_batches";

-- 3. Delete all request intentions
DELETE FROM "request_intentions";

-- 4. Delete all requests
DELETE FROM "requests";
