-- Publish-safe rename of the daily metrics table.
--
-- The original `moizvonki_metrics` was keyed by `date` alone. Turning that into
-- a composite (user_id, date) key required an ADD COLUMN followed by a PRIMARY
-- KEY swap, and the production schema diff emitted the key before the column,
-- which aborted the deploy. Publishing the table under a new name creates the
-- whole definition — composite key included — in one statement, so the ordering
-- problem cannot come back.
ALTER TABLE IF EXISTS "moizvonki_metrics" RENAME TO "moizvonki_daily_metrics";
--> statement-breakpoint

-- Last successful Mango KPI reads. The dashboard renders these immediately and
-- refreshes Mango in the background instead of blocking on it.
CREATE TABLE IF NOT EXISTS "mango_kpi_snapshots" (
	"key" text PRIMARY KEY NOT NULL,
	"payload" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Outcome of the last Mango session attempt, so "logging in again" is
-- distinguishable from "Mango rejected the stored login".
ALTER TABLE "mango_credentials" ADD COLUMN IF NOT EXISTS "session_state" text;
--> statement-breakpoint
ALTER TABLE "mango_credentials" ADD COLUMN IF NOT EXISTS "session_error" text;
--> statement-breakpoint
ALTER TABLE "mango_credentials" ADD COLUMN IF NOT EXISTS "session_checked_at" timestamp with time zone;
