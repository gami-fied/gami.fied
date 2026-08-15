CREATE TABLE "levels" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"level" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon_url" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"required_xp" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "levels_level_check" CHECK ("level" >= 1),
	CONSTRAINT "levels_required_xp_check" CHECK ("required_xp" >= 0)
);
--> statement-breakpoint
ALTER TABLE "levels" ADD CONSTRAINT "levels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "levels_proj_level_unique" ON "levels" USING btree ("project_id","level");--> statement-breakpoint
CREATE UNIQUE INDEX "levels_proj_required_xp_unique" ON "levels" USING btree ("project_id","required_xp");--> statement-breakpoint
CREATE INDEX "levels_proj_required_xp_idx" ON "levels" USING btree ("project_id","required_xp");--> statement-breakpoint
CREATE INDEX "levels_proj_enabled_idx" ON "levels" USING btree ("project_id","enabled");
