ALTER TABLE "end_users" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "end_users_project_created_idx" ON "end_users" ("project_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "end_users_project_name_idx" ON "end_users" ("project_id", "name");
