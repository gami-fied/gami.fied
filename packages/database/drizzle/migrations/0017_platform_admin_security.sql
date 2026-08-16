ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_platform_admin" boolean DEFAULT false NOT NULL;

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;

ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "scopes" jsonb DEFAULT '["*"]'::jsonb NOT NULL;
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;

ALTER TABLE "audit_logs" ALTER COLUMN "project_id" DROP NOT NULL;
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_project_id_projects_id_fk";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL;

ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "organization_id" text;
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_organization_id_organizations_id_fk";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL;

ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "severity" text DEFAULT 'info' NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_audit_logs_org_created" ON "audit_logs" ("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_severity" ON "audit_logs" ("severity", "created_at");
