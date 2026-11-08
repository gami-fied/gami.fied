CREATE TABLE "streak_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger_event" text NOT NULL,
	"cadence" text DEFAULT 'daily' NOT NULL,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"freeze_every" integer DEFAULT 0 NOT NULL,
	"max_freezes" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streak_history" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"definition_id" text NOT NULL,
	"event_id" text,
	"change" text NOT NULL,
	"current" integer NOT NULL,
	"freezes_used" integer DEFAULT 0 NOT NULL,
	"freezes_earned" integer DEFAULT 0 NOT NULL,
	"broken_streak" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_streaks" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"definition_id" text NOT NULL,
	"current" integer DEFAULT 0 NOT NULL,
	"longest" integer DEFAULT 0 NOT NULL,
	"last_period" integer,
	"freezes" integer DEFAULT 0 NOT NULL,
	"time_zone" text,
	"last_activity_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "streak_definitions" ADD CONSTRAINT "streak_definitions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_history" ADD CONSTRAINT "streak_history_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_history" ADD CONSTRAINT "streak_history_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_history" ADD CONSTRAINT "streak_history_definition_id_streak_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."streak_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_history" ADD CONSTRAINT "streak_history_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_definition_id_streak_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."streak_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_project_user_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."end_users"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "streak_definitions_proj_key_unique" ON "streak_definitions" USING btree ("project_id","key");--> statement-breakpoint
CREATE INDEX "streak_definitions_proj_trigger_idx" ON "streak_definitions" USING btree ("project_id","trigger_event","enabled");--> statement-breakpoint
CREATE INDEX "streak_history_user_definition_idx" ON "streak_history" USING btree ("project_id","user_id","definition_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_streaks_user_definition_unique" ON "user_streaks" USING btree ("project_id","user_id","definition_id");--> statement-breakpoint
CREATE INDEX "user_streaks_proj_definition_current_idx" ON "user_streaks" USING btree ("project_id","definition_id","current");