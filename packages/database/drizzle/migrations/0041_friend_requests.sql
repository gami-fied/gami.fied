CREATE TABLE "friend_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_from_user_id_end_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_to_user_id_end_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."end_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "friend_requests_pair_unique" ON "friend_requests" USING btree ("project_id","from_user_id","to_user_id");--> statement-breakpoint
CREATE INDEX "friend_requests_to_idx" ON "friend_requests" USING btree ("project_id","to_user_id","created_at");