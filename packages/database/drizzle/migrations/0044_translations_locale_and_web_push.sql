CREATE TABLE "translations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"locale" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_key" text NOT NULL,
	"field" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "end_users" ADD COLUMN "locale" text;--> statement-breakpoint
ALTER TABLE "push_devices" ADD COLUMN "keys" jsonb;--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "translations_unique" ON "translations" USING btree ("project_id","locale","entity_type","entity_key","field");--> statement-breakpoint
CREATE INDEX "translations_proj_locale_idx" ON "translations" USING btree ("project_id","locale");