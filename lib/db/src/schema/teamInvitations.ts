import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Team membership assignments created by an administrator.
 *
 * This is a role pre-assignment keyed on email, NOT an access gate and not a
 * secret link: anyone can still sign up with Clerk on their own. When the
 * invited email first reaches us, the pre-assigned role is applied on that
 * user's first /me request and the assignment is marked accepted.
 */
export const teamInvitations = pgTable(
  "team_invitations",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    role: text("role").notNull().default("employee"),
    invitedBy: text("invited_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    acceptedByClerkUserId: text("accepted_by_clerk_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // At most one open assignment per person. "Open" here means unaccepted and
    // unrevoked — an EXPIRED row still counts, so re-inviting the same address
    // must revoke the old row first (see the invitation route).
    uniqueIndex("team_invitations_active_email_unique")
      .on(sql`lower(${table.email})`)
      .where(sql`${table.acceptedAt} IS NULL AND ${table.revokedAt} IS NULL`),
  ],
);

export type TeamInvitation = typeof teamInvitations.$inferSelect;