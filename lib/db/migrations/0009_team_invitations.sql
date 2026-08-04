-- Pending invitations pre-assign a role before the colleague first signs in.
-- Raw invitation links are represented only by a SHA-256 hash at rest.
CREATE TABLE IF NOT EXISTS "team_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'employee' NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"accepted_by_clerk_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_invitations_token_hash_unique"
	ON "team_invitations" USING btree ("token_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_invitations_active_email_unique"
	ON "team_invitations" USING btree (lower("email"))
	WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL;