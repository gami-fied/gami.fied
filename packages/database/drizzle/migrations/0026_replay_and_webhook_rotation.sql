-- A replay gets its own queue job, because BullMQ drops a job ID it has already seen.
ALTER TABLE "event_outbox" ADD COLUMN "replay_id" text;--> statement-breakpoint
-- During a secret rotation, deliveries are signed with both the new and the previous secret.
ALTER TABLE "webhook_endpoints" ADD COLUMN "previous_encrypted_secret" text;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "previous_secret_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "disabled_reason" text;
