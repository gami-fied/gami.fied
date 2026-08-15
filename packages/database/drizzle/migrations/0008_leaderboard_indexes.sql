CREATE INDEX IF NOT EXISTS "idx_xp_ledger_project_created_user_amount" ON "xp_ledger" ("project_id", "created_at", "user_id", "amount");
CREATE INDEX IF NOT EXISTS "idx_user_xp_balances_project_total_xp_user" ON "user_xp_balances" ("project_id", "total_xp" DESC, "user_id" ASC);
