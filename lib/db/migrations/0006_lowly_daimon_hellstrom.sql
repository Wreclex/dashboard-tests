CREATE TABLE IF NOT EXISTS "team_members" (
  "clerk_user_id" text PRIMARY KEY NOT NULL,
  "display_name" text,
  "email" text,
  "role" text DEFAULT 'employee' NOT NULL,
  "mango_member_id" integer,
  "mango_member_name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moizvonki_metrics" ADD COLUMN IF NOT EXISTS "user_id" text DEFAULT 'default' NOT NULL;
--> statement-breakpoint
ALTER TABLE "moizvonki_metrics" DROP CONSTRAINT IF EXISTS "moizvonki_metrics_pkey";
--> statement-breakpoint
ALTER TABLE "moizvonki_metrics" ADD CONSTRAINT "moizvonki_metrics_user_id_date_pk" PRIMARY KEY("user_id","date");
