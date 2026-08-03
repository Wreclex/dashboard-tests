CREATE TABLE IF NOT EXISTS "telegram_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"chat_id" text NOT NULL,
	"bot_token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telegram_channels_user_id_idx" ON "telegram_channels" ("user_id");
