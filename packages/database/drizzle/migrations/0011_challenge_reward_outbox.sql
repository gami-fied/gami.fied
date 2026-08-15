CREATE TABLE IF NOT EXISTS "challenge_reward_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"challenge_id" text NOT NULL,
	"user_id" text NOT NULL,
	"event_id" text NOT NULL,
	"reward_type" text NOT NULL,
	"reward_payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "challenge_reward_outbox" ADD CONSTRAINT "challenge_reward_outbox_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "challenge_reward_outbox" ADD CONSTRAINT "challenge_reward_outbox_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "challenge_reward_outbox" ADD CONSTRAINT "challenge_reward_outbox_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "challenge_reward_outbox" ADD CONSTRAINT "challenge_reward_outbox_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cro_status_available" ON "challenge_reward_outbox" USING btree ("status","available_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cro_proj_user_ch" ON "challenge_reward_outbox" USING btree ("project_id","user_id","challenge_id");
