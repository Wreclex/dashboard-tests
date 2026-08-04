CREATE TABLE IF NOT EXISTS "moizvonki_connections" (
  "id" text PRIMARY KEY NOT NULL,
  "login" text,
  "password" text,
  "cookies" text,
  "report_url" text,
  "headers" text,
  "last_fetch_at" timestamp with time zone,
  "last_error" text,
  "last_source" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "moizvonki_metrics" (
  "date" text PRIMARY KEY NOT NULL,
  "calls" integer NOT NULL,
  "traffic_seconds" integer NOT NULL,
  "source" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "moizvonki_settings" (
  "id" text PRIMARY KEY NOT NULL,
  "shift_hours" real DEFAULT 9.5 NOT NULL,
  "refresh_interval_minutes" integer DEFAULT 15 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
