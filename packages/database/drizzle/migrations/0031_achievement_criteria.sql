CREATE TABLE "user_achievement_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"achievement_id" text NOT NULL,
	"value" double precision DEFAULT 0 NOT NULL,
	"tier" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "achievements" ADD COLUMN "criteria" jsonb;--> statement-breakpoint
ALTER TABLE "achievements" ADD COLUMN "tiers" jsonb;--> statement-breakpoint
ALTER TABLE "achievements" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_achievement_progress" ADD CONSTRAINT "user_achievement_progress_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievement_progress" ADD CONSTRAINT "user_achievement_progress_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievement_progress" ADD CONSTRAINT "user_achievement_progress_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievement_progress" ADD CONSTRAINT "user_achievement_progress_project_user_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."end_users"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_achievement_progress_unique" ON "user_achievement_progress" USING btree ("project_id","user_id","achievement_id");--> statement-breakpoint
CREATE INDEX "user_achievement_progress_user_idx" ON "user_achievement_progress" USING btree ("project_id","user_id");