import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Pending team membership assignments created by an administrator.
 *
 * The raw invitation token is deliberately never stored. The recipient can
 * sign in normally with Clerk; their email is then matched to the active
 * assignment and their role is applied on their first /me request.
 */
export const teamInvitations = pgTable(
  "team_invitations",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    role: text("role").notNull().default("employee"),
    tokenHash: text("token_hash").notNull(),
    invitedBy: text("invited_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    acceptedByClerkUserId: text("accepted_by_clerk_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("team_invitations_token_hash_unique").on(table.tokenHash),
    // An admin can replace a pending invitation for an email, but cannot
    // accidentally create two active assignments for the same person.
    uniqueIndex("team_invitations_active_email_unique")
      .on(sql`lower(${table.email})`)
      .where(sql`${table.acceptedAt} IS NULL AND ${table.revokedAt} IS NULL`),
  ],
);

export type TeamInvitation = typeof teamInvitations.$inferSelect;