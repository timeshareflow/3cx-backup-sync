-- Add storage_backend to faxes (was missing entirely)
ALTER TABLE "faxes" ADD COLUMN "storage_backend" varchar(20) DEFAULT 'spaces';

-- Add storage_backend to call_recordings (was missing entirely)
ALTER TABLE "call_recordings" ADD COLUMN "storage_backend" varchar(20) DEFAULT 'spaces';

-- Fix incorrect defaults on existing tables (were set to 'supabase')
ALTER TABLE "media_files" ALTER COLUMN "storage_backend" SET DEFAULT 'spaces';
ALTER TABLE "voicemails" ALTER COLUMN "storage_backend" SET DEFAULT 'spaces';

-- Mark all existing rows as spaces — DO Spaces migration is complete
UPDATE "media_files" SET "storage_backend" = 'spaces' WHERE "storage_backend" IS DISTINCT FROM 'spaces';
UPDATE "voicemails" SET "storage_backend" = 'spaces' WHERE "storage_backend" IS DISTINCT FROM 'spaces';
UPDATE "call_recordings" SET "storage_backend" = 'spaces';
UPDATE "faxes" SET "storage_backend" = 'spaces';
