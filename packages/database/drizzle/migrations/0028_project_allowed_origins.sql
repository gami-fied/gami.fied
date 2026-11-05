ALTER TABLE "projects" ADD COLUMN "allowed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL;
