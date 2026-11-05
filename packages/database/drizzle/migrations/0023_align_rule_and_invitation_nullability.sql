ALTER TABLE "rules" ALTER COLUMN "conditions" DROP NOT NULL;--> statement-breakpoint
UPDATE "invitation" SET "role" = 'member' WHERE "role" IS NULL;--> statement-breakpoint
ALTER TABLE "invitation" ALTER COLUMN "role" SET NOT NULL;
