ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscribed_to_system_emails" boolean DEFAULT true NOT NULL;
