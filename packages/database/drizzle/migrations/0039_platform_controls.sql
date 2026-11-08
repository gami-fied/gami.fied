CREATE TABLE "abuse_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"observed" integer NOT NULL,
	"threshold" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"auto_hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "abuse_settings" (
	"project_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"xp_per_hour" integer,
	"events_per_hour" integer,
	"auto_hide" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"feature" text NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"max_projects" integer,
	"max_members" integer,
	"allowed_email_domains" jsonb,
	"api_key_max_lifetime_days" integer,
	"api_ip_allowlist" jsonb,
	"require_allowed_origins" boolean,
	"events_per_minute" integer,
	"admin_notes" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rewards" ADD COLUMN "code_prefix" text;--> statement-breakpoint
ALTER TABLE "wallet_lots" ADD COLUMN "expiry_warned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "abuse_flags" ADD CONSTRAINT "abuse_flags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abuse_flags" ADD CONSTRAINT "abuse_flags_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abuse_settings" ADD CONSTRAINT "abuse_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_settings" ADD CONSTRAINT "feature_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_policies" ADD CONSTRAINT "organization_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abuse_flags_project_idx" ON "abuse_flags" USING btree ("project_id","status","created_at");--> statement-breakpoint
CREATE INDEX "abuse_flags_user_idx" ON "abuse_flags" USING btree ("user_id","kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_settings_instance_unique" ON "feature_settings" USING btree ("feature") WHERE "feature_settings"."organization_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "feature_settings_org_unique" ON "feature_settings" USING btree ("organization_id","feature") WHERE "feature_settings"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_policies_instance_unique" ON "organization_policies" USING btree ((1)) WHERE "organization_policies"."organization_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_policies_org_unique" ON "organization_policies" USING btree ("organization_id") WHERE "organization_policies"."organization_id" IS NOT NULL;