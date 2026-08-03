-- Migrate mango_credentials to the headless-browser login model:
-- email/password (encrypted login) + auth_token/refresh_token (encrypted cache).
-- Legacy rows (bearer_token / repurposed columns) are unusable in the new
-- model, so the table is cleared; users re-enter their Mango login once.
DELETE FROM "mango_credentials";
--> statement-breakpoint
ALTER TABLE "mango_credentials" DROP COLUMN IF EXISTS "bearer_token";
--> statement-breakpoint
ALTER TABLE "mango_credentials" ADD COLUMN IF NOT EXISTS "email" text;
--> statement-breakpoint
ALTER TABLE "mango_credentials" ADD COLUMN IF NOT EXISTS "password" text;
--> statement-breakpoint
ALTER TABLE "mango_credentials" ADD COLUMN IF NOT EXISTS "auth_token" text;
--> statement-breakpoint
ALTER TABLE "mango_credentials" ADD COLUMN IF NOT EXISTS "refresh_token" text;
--> statement-breakpoint
ALTER TABLE "mango_credentials" ALTER COLUMN "email" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "mango_credentials" ALTER COLUMN "password" SET NOT NULL;
