CREATE TABLE "currencies" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"symbol" text,
	"expires_after_days" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reward_id" text NOT NULL,
	"reward_name" text NOT NULL,
	"currency_id" text NOT NULL,
	"cost" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"code" text,
	"note" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"reward_id" text NOT NULL,
	"project_id" text NOT NULL,
	"code" text NOT NULL,
	"redemption_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"currency_id" text NOT NULL,
	"cost" integer NOT NULL,
	"stock" integer,
	"per_user_limit" integer,
	"kind" text DEFAULT 'fulfilled_by_you' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"currency_id" text NOT NULL,
	"amount" integer NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"metadata" jsonb,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_lots" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"currency_id" text NOT NULL,
	"amount" integer NOT NULL,
	"remaining" integer NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "currencies" ADD CONSTRAINT "currencies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_reward_id_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_project_user_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."end_users"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_codes" ADD CONSTRAINT "reward_codes_reward_id_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_codes" ADD CONSTRAINT "reward_codes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_currency_id_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_currency_id_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_project_user_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."end_users"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_lots" ADD CONSTRAINT "wallet_lots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_lots" ADD CONSTRAINT "wallet_lots_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_lots" ADD CONSTRAINT "wallet_lots_currency_id_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_lots" ADD CONSTRAINT "wallet_lots_project_user_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."end_users"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "currencies_proj_key_unique" ON "currencies" USING btree ("project_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "redemptions_idempotency_unique" ON "redemptions" USING btree ("project_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "redemptions_proj_status_idx" ON "redemptions" USING btree ("project_id","status","created_at");--> statement-breakpoint
CREATE INDEX "redemptions_user_idx" ON "redemptions" USING btree ("project_id","user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_codes_reward_code_unique" ON "reward_codes" USING btree ("reward_id","code");--> statement-breakpoint
CREATE INDEX "reward_codes_available_idx" ON "reward_codes" USING btree ("reward_id","redemption_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rewards_proj_key_unique" ON "rewards" USING btree ("project_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_entries_idempotency_unique" ON "wallet_entries" USING btree ("project_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "wallet_entries_user_idx" ON "wallet_entries" USING btree ("project_id","user_id","currency_id","created_at");--> statement-breakpoint
CREATE INDEX "wallet_lots_spend_idx" ON "wallet_lots" USING btree ("project_id","user_id","currency_id","expires_at");