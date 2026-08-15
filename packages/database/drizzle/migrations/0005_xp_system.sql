CREATE TABLE "xp_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"event_id" text,
	"rule_id" text,
	"rule_execution_id" text,
	"idempotency_key" text,
	"amount" bigint NOT NULL,
	"reason" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_xp_balances" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"total_xp" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_rule_execution_id_rule_executions_id_fk" FOREIGN KEY ("rule_execution_id") REFERENCES "public"."rule_executions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_xp_balances" ADD CONSTRAINT "user_xp_balances_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_xp_balances" ADD CONSTRAINT "user_xp_balances_user_id_end_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "xp_ledger_rule_execution_unique" ON "xp_ledger" USING btree ("rule_execution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "xp_ledger_proj_idempotency_unique" ON "xp_ledger" USING btree ("project_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "xp_ledger_proj_user_created_idx" ON "xp_ledger" USING btree ("project_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "xp_ledger_event_id_idx" ON "xp_ledger" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "xp_ledger_rule_id_idx" ON "xp_ledger" USING btree ("rule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_xp_balances_proj_user_unique" ON "user_xp_balances" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "user_xp_balances_proj_total_idx" ON "user_xp_balances" USING btree ("project_id","total_xp");
