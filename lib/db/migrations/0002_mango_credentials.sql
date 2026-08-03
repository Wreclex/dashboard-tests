CREATE TABLE IF NOT EXISTS "mango_credentials" (
  "user_id" text PRIMARY KEY NOT NULL,
  "bearer_token" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mango_credentials_user_id_idx" ON "mango_credentials" ("user_id");