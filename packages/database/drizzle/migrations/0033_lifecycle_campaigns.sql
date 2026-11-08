CREATE TABLE "lifecycle_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lifecycle_sends" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"user_id" text NOT NULL,
	"period_key" text NOT NULL,
	"email_outbox_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lifecycle_campaigns" ADD CONSTRAINT "lifecycle_campaigns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_sends" ADD CONSTRAINT "lifecycle_sends_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_sends" ADD CONSTRAINT "lifecycle_sends_campaign_id_lifecycle_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."lifecycle_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_sends" ADD CONSTRAINT "lifecycle_sends_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_sends" ADD CONSTRAINT "lifecycle_sends_project_user_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."end_users"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lifecycle_campaigns_proj_enabled_idx" ON "lifecycle_campaigns" USING btree ("project_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "lifecycle_sends_campaign_user_period_unique" ON "lifecycle_sends" USING btree ("campaign_id","user_id","period_key");--> statement-breakpoint
CREATE INDEX "lifecycle_sends_campaign_created_idx" ON "lifecycle_sends" USING btree ("campaign_id","created_at");