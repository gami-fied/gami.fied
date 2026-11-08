CREATE TABLE "connectors" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"secret_encrypted" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"received_count" integer DEFAULT 0 NOT NULL,
	"last_received_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"friend_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kudos" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league_members" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text NOT NULL,
	"league_id" text NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"tier" integer NOT NULL,
	"group_no" integer NOT NULL,
	"final_rank" integer,
	"final_xp" integer,
	"outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league_seasons" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"project_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"tiers" jsonb NOT NULL,
	"group_size" integer DEFAULT 30 NOT NULL,
	"promote" integer DEFAULT 5 NOT NULL,
	"relegate" integer DEFAULT 5 NOT NULL,
	"cadence" text DEFAULT 'weekly' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_programs" (
	"project_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"qualifying_event" text,
	"referrer_xp" integer DEFAULT 0 NOT NULL,
	"referee_xp" integer DEFAULT 0 NOT NULL,
	"currency_key" text,
	"referrer_currency" integer DEFAULT 0 NOT NULL,
	"max_rewards_per_referrer" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"referrer_id" text NOT NULL,
	"referee_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"qualified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"filter" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "environment" text DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "promotes_to_project_id" text;--> statement-breakpoint
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_friend_id_end_users_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudos" ADD CONSTRAINT "kudos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudos" ADD CONSTRAINT "kudos_from_user_id_end_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudos" ADD CONSTRAINT "kudos_to_user_id_end_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_season_id_league_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."league_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_seasons" ADD CONSTRAINT "league_seasons_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_seasons" ADD CONSTRAINT "league_seasons_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_programs" ADD CONSTRAINT "referral_programs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_end_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_id_end_users_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connectors_project_idx" ON "connectors" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "friendships_pair_unique" ON "friendships" USING btree ("project_id","user_id","friend_id");--> statement-breakpoint
CREATE INDEX "kudos_to_idx" ON "kudos" USING btree ("project_id","to_user_id","created_at");--> statement-breakpoint
CREATE INDEX "kudos_from_idx" ON "kudos" USING btree ("project_id","from_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "league_members_season_user_unique" ON "league_members" USING btree ("season_id","user_id");--> statement-breakpoint
CREATE INDEX "league_members_group_idx" ON "league_members" USING btree ("season_id","tier","group_no");--> statement-breakpoint
CREATE INDEX "league_members_user_idx" ON "league_members" USING btree ("user_id","league_id");--> statement-breakpoint
CREATE UNIQUE INDEX "league_seasons_league_start_unique" ON "league_seasons" USING btree ("league_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "leagues_proj_key_unique" ON "leagues" USING btree ("project_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_code_unique" ON "referral_codes" USING btree ("project_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_user_unique" ON "referral_codes" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_referee_unique" ON "referrals" USING btree ("project_id","referee_id");--> statement-breakpoint
CREATE INDEX "referrals_referrer_idx" ON "referrals" USING btree ("project_id","referrer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "segments_proj_key_unique" ON "segments" USING btree ("project_id","key");