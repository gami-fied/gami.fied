CREATE TABLE "rule_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"event_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"executed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rule_executions" ADD CONSTRAINT "rule_executions_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_executions" ADD CONSTRAINT "rule_executions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rule_executions_rule_event_unique" ON "rule_executions" USING btree ("rule_id","event_id");--> statement-breakpoint
CREATE INDEX "rule_executions_rule_id_idx" ON "rule_executions" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "rule_executions_event_id_idx" ON "rule_executions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "rule_executions_status_idx" ON "rule_executions" USING btree ("status");
