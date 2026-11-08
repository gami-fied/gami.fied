DROP INDEX "user_challenge_progress_proj_user_challenge_unique";--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "filters" jsonb;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "steps" jsonb;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "recurrence" text;--> statement-breakpoint
ALTER TABLE "user_challenge_progress" ADD COLUMN "period_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_challenge_progress_proj_user_challenge_period_unique" ON "user_challenge_progress" USING btree ("project_id","user_id","challenge_id","period_key");