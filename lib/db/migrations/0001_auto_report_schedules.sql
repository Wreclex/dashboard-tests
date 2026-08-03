CREATE TABLE IF NOT EXISTS "user_report_state" (
"id" serial PRIMARY KEY NOT NULL,
"user_id" text NOT NULL,
"state" jsonb NOT NULL,
"signature" jsonb NOT NULL,
"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_report_state_user_id_idx" ON "user_report_state" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auto_report_schedules" (
"id" serial PRIMARY KEY NOT NULL,
"user_id" text NOT NULL,
"channel_id" integer NOT NULL,
"interval_minutes" integer NOT NULL,
"report_type" integer NOT NULL,
"is_active" boolean DEFAULT false NOT NULL,
"last_sent_at" timestamp,
"next_run_at" timestamp,
"delivery_lease_until" timestamp,
"delivery_lease_token" text,
"created_at" timestamp DEFAULT now() NOT NULL,
"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auto_report_schedules_user_id_idx" ON "auto_report_schedules" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auto_report_schedules_active_idx" ON "auto_report_schedules" ("is_active");