-- Add Z-API WhatsApp integration fields to parishes
ALTER TABLE "parishes" ADD COLUMN "zapi_instance_id" TEXT;
ALTER TABLE "parishes" ADD COLUMN "zapi_token" TEXT;
ALTER TABLE "parishes" ADD COLUMN "zapi_phone" TEXT;
ALTER TABLE "parishes" ADD COLUMN "pastor_phone" TEXT;
ALTER TABLE "parishes" ADD COLUMN "dispatch_phones" TEXT[] DEFAULT '{}';
