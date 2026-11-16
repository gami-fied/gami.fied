CREATE TABLE "cosmetics" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" text DEFAULT 'title' NOT NULL,
	"image_url" text,
	"achievement_id" text,
	"currency_id" text,
	"cost" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journey_completions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"journey_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journeys" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rewards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaderboard_payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"prize_id" text NOT NULL,
	"period" text NOT NULL,
	"period_key" text NOT NULL,
	"rank" integer NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"rewards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaderboard_prizes" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"period" text NOT NULL,
	"from_rank" integer DEFAULT 1 NOT NULL,
	"to_rank" integer DEFAULT 1 NOT NULL,
	"rewards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_paid_period" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loot_box_opens" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"box_id" text NOT NULL,
	"item_id" text NOT NULL,
	"item_name" text NOT NULL,
	"prizes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rare" boolean DEFAULT false NOT NULL,
	"guaranteed" boolean DEFAULT false NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loot_boxes" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"kind" text DEFAULT 'box' NOT NULL,
	"currency_id" text,
	"cost" integer DEFAULT 0 NOT NULL,
	"guarantee_after" integer,
	"daily_limit" integer,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season_pass_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"pass_id" text NOT NULL,
	"premium" boolean DEFAULT false NOT NULL,
	"claimed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season_passes" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"premium_currency_id" text,
	"premium_cost" integer,
	"tiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_goal_contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"goal_id" text NOT NULL,
	"scope_key" text DEFAULT 'all' NOT NULL,
	"user_id" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_goal_events" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"goal_id" text NOT NULL,
	"event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_goal_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"goal_id" text NOT NULL,
	"scope_key" text DEFAULT 'all' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"scope" text DEFAULT 'community' NOT NULL,
	"trigger" text NOT NULL,
	"filters" jsonb,
	"amount_field" text,
	"target" integer NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"rewards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"max_members" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_cosmetics" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"cosmetic_id" text NOT NULL,
	"source" text DEFAULT 'grant' NOT NULL,
	"equipped" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cosmetics" ADD CONSTRAINT "cosmetics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cosmetics" ADD CONSTRAINT "cosmetics_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cosmetics" ADD CONSTRAINT "cosmetics_currency_id_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_completions" ADD CONSTRAINT "journey_completions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_completions" ADD CONSTRAINT "journey_completions_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_completions" ADD CONSTRAINT "journey_completions_journey_id_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."journeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_completions" ADD CONSTRAINT "journey_completions_project_user_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."end_users"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_payouts" ADD CONSTRAINT "leaderboard_payouts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_payouts" ADD CONSTRAINT "leaderboard_payouts_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_payouts" ADD CONSTRAINT "leaderboard_payouts_prize_id_leaderboard_prizes_id_fk" FOREIGN KEY ("prize_id") REFERENCES "public"."leaderboard_prizes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_payouts" ADD CONSTRAINT "leaderboard_payouts_project_user_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."end_users"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_prizes" ADD CONSTRAINT "leaderboard_prizes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loot_box_opens" ADD CONSTRAINT "loot_box_opens_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loot_box_opens" ADD CONSTRAINT "loot_box_opens_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loot_box_opens" ADD CONSTRAINT "loot_box_opens_box_id_loot_boxes_id_fk" FOREIGN KEY ("box_id") REFERENCES "public"."loot_boxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loot_box_opens" ADD CONSTRAINT "loot_box_opens_project_user_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."end_users"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loot_boxes" ADD CONSTRAINT "loot_boxes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loot_boxes" ADD CONSTRAINT "loot_boxes_currency_id_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_pass_progress" ADD CONSTRAINT "season_pass_progress_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_pass_progress" ADD CONSTRAINT "season_pass_progress_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_pass_progress" ADD CONSTRAINT "season_pass_progress_pass_id_season_passes_id_fk" FOREIGN KEY ("pass_id") REFERENCES "public"."season_passes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_pass_progress" ADD CONSTRAINT "season_pass_progress_project_user_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."end_users"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_passes" ADD CONSTRAINT "season_passes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_passes" ADD CONSTRAINT "season_passes_premium_currency_id_currencies_id_fk" FOREIGN KEY ("premium_currency_id") REFERENCES "public"."currencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_goal_contributions" ADD CONSTRAINT "shared_goal_contributions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_goal_contributions" ADD CONSTRAINT "shared_goal_contributions_goal_id_shared_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."shared_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_goal_contributions" ADD CONSTRAINT "shared_goal_contributions_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_goal_contributions" ADD CONSTRAINT "shared_goal_contributions_project_user_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."end_users"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_goal_events" ADD CONSTRAINT "shared_goal_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_goal_events" ADD CONSTRAINT "shared_goal_events_goal_id_shared_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."shared_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_goal_progress" ADD CONSTRAINT "shared_goal_progress_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_goal_progress" ADD CONSTRAINT "shared_goal_progress_goal_id_shared_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."shared_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_goals" ADD CONSTRAINT "shared_goals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_project_user_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."end_users"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cosmetics" ADD CONSTRAINT "user_cosmetics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cosmetics" ADD CONSTRAINT "user_cosmetics_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cosmetics" ADD CONSTRAINT "user_cosmetics_cosmetic_id_cosmetics_id_fk" FOREIGN KEY ("cosmetic_id") REFERENCES "public"."cosmetics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cosmetics" ADD CONSTRAINT "user_cosmetics_project_user_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."end_users"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cosmetics_proj_key_unique" ON "cosmetics" USING btree ("project_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_completions_journey_user_unique" ON "journey_completions" USING btree ("journey_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journeys_proj_key_unique" ON "journeys" USING btree ("project_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboard_payouts_prize_period_user_unique" ON "leaderboard_payouts" USING btree ("prize_id","period_key","user_id");--> statement-breakpoint
CREATE INDEX "leaderboard_payouts_proj_idx" ON "leaderboard_payouts" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "leaderboard_prizes_proj_idx" ON "leaderboard_prizes" USING btree ("project_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "loot_box_opens_idempotency_unique" ON "loot_box_opens" USING btree ("project_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "loot_box_opens_box_user_idx" ON "loot_box_opens" USING btree ("box_id","user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "loot_boxes_proj_key_unique" ON "loot_boxes" USING btree ("project_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "season_pass_progress_pass_user_unique" ON "season_pass_progress" USING btree ("pass_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "season_passes_proj_key_unique" ON "season_passes" USING btree ("project_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_goal_contributions_goal_user_unique" ON "shared_goal_contributions" USING btree ("goal_id","user_id");--> statement-breakpoint
CREATE INDEX "shared_goal_contributions_unpaid_idx" ON "shared_goal_contributions" USING btree ("goal_id","scope_key","paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_goal_events_goal_event_unique" ON "shared_goal_events" USING btree ("goal_id","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_goal_progress_goal_scope_unique" ON "shared_goal_progress" USING btree ("goal_id","scope_key");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_goals_proj_key_unique" ON "shared_goals" USING btree ("project_id","key");--> statement-breakpoint
CREATE INDEX "shared_goals_proj_trigger_idx" ON "shared_goals" USING btree ("project_id","enabled","trigger");--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_proj_user_unique" ON "team_members" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "team_members_team_idx" ON "team_members" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_proj_key_unique" ON "teams" USING btree ("project_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "user_cosmetics_user_cosmetic_unique" ON "user_cosmetics" USING btree ("user_id","cosmetic_id");--> statement-breakpoint
CREATE INDEX "user_cosmetics_equipped_idx" ON "user_cosmetics" USING btree ("project_id","user_id","equipped");