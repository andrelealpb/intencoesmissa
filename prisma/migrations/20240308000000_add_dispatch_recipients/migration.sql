-- Add dispatch_recipients JSONB to parishes (array of {name, email, phone})
-- Keeps dispatch_emails and dispatch_phones for backward compatibility
ALTER TABLE "parishes" ADD COLUMN "dispatch_recipients" JSONB;

-- Migrate existing data: create recipients from dispatch_emails + dispatch_phones
UPDATE "parishes"
SET "dispatch_recipients" = (
  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object('name', '', 'email', e, 'phone', '') AS r
    FROM unnest("dispatch_emails") AS e
  ) sub
)
WHERE array_length("dispatch_emails", 1) > 0;
