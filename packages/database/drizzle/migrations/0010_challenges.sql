CREATE TABLE IF NOT EXISTS "challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon_url" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"trigger" text NOT NULL,
	"type" text DEFAULT 'counter' NOT NULL,
	"target" integer NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"rewards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenges_target_check" CHECK (target > 0)
);

CREATE TABLE IF NOT EXISTS "user_challenge_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"challenge_id" text NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_challenge_progress_progress_check" CHECK (progress >= 0)
);

CREATE TABLE IF NOT EXISTS "challenge_event_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"challenge_id" text NOT NULL,
	"user_id" text NOT NULL,
	"event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "challenges" ADD CONSTRAINT "challenges_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_challenge_progress" ADD CONSTRAINT "user_challenge_progress_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_challenge_progress" ADD CONSTRAINT "user_challenge_progress_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_challenge_progress" ADD CONSTRAINT "user_challenge_progress_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "challenge_event_progress" ADD CONSTRAINT "challenge_event_progress_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "challenge_event_progress" ADD CONSTRAINT "challenge_event_progress_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "challenge_event_progress" ADD CONSTRAINT "challenge_event_progress_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "challenge_event_progress" ADD CONSTRAINT "challenge_event_progress_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "challenges_proj_key_unique" ON "challenges" ("project_id","key");
CREATE INDEX IF NOT EXISTS "idx_challenges_proj_enabled_trigger" ON "challenges" ("project_id","enabled","trigger");

CREATE UNIQUE INDEX IF NOT EXISTS "user_challenge_progress_proj_user_challenge_unique" ON "user_challenge_progress" ("project_id","user_id","challenge_id");
CREATE INDEX IF NOT EXISTS "idx_user_challenge_progress_proj_challenge" ON "user_challenge_progress" ("project_id","challenge_id");
CREATE INDEX IF NOT EXISTS "idx_user_challenge_progress_proj_user" ON "user_challenge_progress" ("project_id","user_id");
CREATE INDEX IF NOT EXISTS "idx_user_challenge_progress_challenge_completed" ON "user_challenge_progress" ("challenge_id","completed");
CREATE INDEX IF NOT EXISTS "idx_user_challenge_progress_challenge_progress" ON "user_challenge_progress" ("challenge_id","progress");

CREATE UNIQUE INDEX IF NOT EXISTS "challenge_event_progress_project_challenge_event_unique" ON "challenge_event_progress" ("project_id","challenge_id","event_id");
CREATE INDEX IF NOT EXISTS "idx_challenge_event_progress_proj_challenge" ON "challenge_event_progress" ("project_id","challenge_id");
CREATE INDEX IF NOT EXISTS "idx_challenge_event_progress_proj_user" ON "challenge_event_progress" ("project_id","user_id");
CREATE INDEX IF NOT EXISTS "idx_challenge_event_progress_event" ON "challenge_event_progress" ("event_id");
