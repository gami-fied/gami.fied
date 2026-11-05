ALTER TABLE "webhook_endpoints" RENAME COLUMN "secret_hash" TO "encrypted_secret";--> statement-breakpoint
CREATE UNIQUE INDEX "end_users_project_id_id_unique" ON "end_users" USING btree ("project_id","id");--> statement-breakpoint
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_project_user_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."end_users"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_xp_balances" ADD CONSTRAINT "user_xp_balances_project_user_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."end_users"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_project_user_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."end_users"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_challenge_progress" ADD CONSTRAINT "user_challenge_progress_project_user_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."end_users"("project_id","id") ON DELETE cascade ON UPDATE no action;
