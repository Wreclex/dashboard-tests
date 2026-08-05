-- Invitations are an email-based role pre-assignment, not a link secret.
-- The token was generated, hashed and stored, but nothing ever validated it:
-- the role is applied when the invited email first signs in. Drop the column
-- (and its unique index) so the schema stops implying a security property the
-- flow does not have.
DROP INDEX IF EXISTS "team_invitations_token_hash_unique";
--> statement-breakpoint
ALTER TABLE "team_invitations" DROP COLUMN IF EXISTS "token_hash";
