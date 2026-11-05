-- Lets one rule execution award XP once per action rather than once overall.
ALTER TABLE "xp_ledger" ADD COLUMN "action_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DROP INDEX "xp_ledger_rule_execution_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "xp_ledger_rule_execution_action_unique" ON "xp_ledger" USING btree ("rule_execution_id","action_index");--> statement-breakpoint
-- user_achievements_proj_user_ach_unique already makes a grant idempotent, and this index dropped the
-- second achievement of a rule with two achievement actions.
DROP INDEX "user_achievements_rule_execution_unique";
