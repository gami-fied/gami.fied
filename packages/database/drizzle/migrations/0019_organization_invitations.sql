ALTER TABLE "invitation" ADD COLUMN IF NOT EXISTS "token_hash" text NOT NULL UNIQUE;
ALTER TABLE "invitation" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "invitation" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "invitation" ADD COLUMN IF NOT EXISTS "accepted_at" timestamp with time zone;
ALTER TABLE "invitation" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone;
ALTER TABLE "invitation" ALTER COLUMN "role" SET DEFAULT 'member';
ALTER TABLE "invitation" ALTER COLUMN "status" SET DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS "invitation_org_id_idx" ON "invitation" ("organization_id");
CREATE INDEX IF NOT EXISTS "invitation_email_idx" ON "invitation" ("email");
CREATE INDEX IF NOT EXISTS "invitation_token_hash_idx" ON "invitation" ("token_hash");
CREATE INDEX IF NOT EXISTS "invitation_org_email_status_idx" ON "invitation" ("organization_id", "email", "status");

CREATE TABLE IF NOT EXISTS "project_members" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action,
	"user_id" text NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_members_project_user_idx" ON "project_members" ("project_id", "user_id");
CREATE INDEX IF NOT EXISTS "project_members_user_id_idx" ON "project_members" ("user_id");
CREATE INDEX IF NOT EXISTS "project_members_project_id_idx" ON "project_members" ("project_id");
