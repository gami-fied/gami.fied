CREATE TABLE "xp_boosts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"multiplier" double precision NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"days_of_week" jsonb,
	"from_hour" integer,
	"to_hour" integer,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"event_types" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xp_limit_hits" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"limit_id" text,
	"limit_name" text NOT NULL,
	"rule_id" text,
	"event_id" text,
	"wanted" integer NOT NULL,
	"given" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xp_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"period" text,
	"amount" integer NOT NULL,
	"rule_id" text,
	"event_type" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "end_users_project_inactive_idx";--> statement-breakpoint
ALTER TABLE "end_users" ADD COLUMN "ranking_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "xp_boosts" ADD CONSTRAINT "xp_boosts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_limit_hits" ADD CONSTRAINT "xp_limit_hits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_limit_hits" ADD CONSTRAINT "xp_limit_hits_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_limit_hits" ADD CONSTRAINT "xp_limit_hits_limit_id_xp_limits_id_fk" FOREIGN KEY ("limit_id") REFERENCES "public"."xp_limits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_limit_hits" ADD CONSTRAINT "xp_limit_hits_project_user_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."end_users"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_limits" ADD CONSTRAINT "xp_limits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "xp_boosts_proj_enabled_idx" ON "xp_boosts" USING btree ("project_id","enabled");--> statement-breakpoint
CREATE INDEX "xp_limit_hits_user_idx" ON "xp_limit_hits" USING btree ("project_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "xp_limit_hits_proj_created_idx" ON "xp_limit_hits" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "xp_limits_proj_enabled_idx" ON "xp_limits" USING btree ("project_id","enabled");--> statement-breakpoint
CREATE INDEX "end_users_project_inactive_idx" ON "end_users" USING btree ("project_id","id") WHERE "end_users"."active" = false OR "end_users"."ranking_hidden" = true;