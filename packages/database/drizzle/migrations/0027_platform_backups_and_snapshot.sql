-- The service used to create this table at runtime. IF NOT EXISTS covers those databases.
-- The snapshot added with this migration replaces the 24 that were never committed.
CREATE TABLE IF NOT EXISTS "platform_backups" (
	"id" text PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"file_path" text NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"backup_type" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'creating' NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"checksum_sha256" text,
	"encrypted" boolean DEFAULT false NOT NULL,
	"encryption_algorithm" text,
	"app_version" text DEFAULT '0.1.0' NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"duration_ms" integer,
	"created_by_actor_id" text NOT NULL,
	"expires_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_platform_backups_status" ON "platform_backups" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_platform_backups_created_at" ON "platform_backups" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_platform_backups_type" ON "platform_backups" USING btree ("backup_type");
