CREATE TABLE "achievements" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon_url" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"achievement_id" text NOT NULL,
	"event_id" text,
	"rule_execution_id" text,
	"metadata" jsonb,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_rule_execution_id_rule_executions_id_fk" FOREIGN KEY ("rule_execution_id") REFERENCES "public"."rule_executions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "achievements_proj_key_unique" ON "achievements" USING btree ("project_id","key");--> statement-breakpoint
CREATE INDEX "achievements_proj_enabled_idx" ON "achievements" USING btree ("project_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "user_achievements_proj_user_ach_unique" ON "user_achievements" USING btree ("project_id","user_id","achievement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_achievements_rule_execution_unique" ON "user_achievements" USING btree ("rule_execution_id") WHERE rule_execution_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "user_achievements_proj_user_idx" ON "user_achievements" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "user_achievements_proj_ach_idx" ON "user_achievements" USING btree ("project_id","achievement_id");--> statement-breakpoint
CREATE INDEX "user_achievements_user_idx" ON "user_achievements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_achievements_ach_idx" ON "user_achievements" USING btree ("achievement_id");--> statement-breakpoint
CREATE INDEX "user_achievements_awarded_idx" ON "user_achievements" USING btree ("awarded_at");
