import { pgTable, text, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Unified user/role registry shared by the Report Tool and the call dashboard
 * (Дашборд звонков). One row per Clerk user; created lazily on first sign-in
 * to either app.
 *
 * Roles:
 *  - admin    — project owner; the FIRST registered user becomes admin.
 *               Manages everyone else's role. Cannot demote themselves.
 *  - manager  — sees the whole team's Mango KPI in the dashboard.
 *  - employee — default role; sees only their own numbers.
 *
 * mangoMemberId/mangoMemberName bind the Clerk user to their Mango Office
 * operator (chosen from the operator list on first dashboard login) so the
 * shared Mango connection can scope KPI rows per person.
 */
export const teamMembers = pgTable(
  "team_members",
  {
    clerkUserId: text("clerk_user_id").primaryKey(),
    displayName: text("display_name"),
    email: text("email"),
    role: text("role").notNull().default("employee"),
    mangoMemberId: integer("mango_member_id"),
    mangoMemberName: text("mango_member_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // A Mango operator can be claimed by only one Clerk user. NULL is allowed
    // for users that have not completed dashboard onboarding yet.
    uniqueIndex("team_members_mango_member_id_unique")
      .on(table.mangoMemberId)
      .where(sql`${table.mangoMemberId} IS NOT NULL`),
  ],
);

export type TeamMember = typeof teamMembers.$inferSelect;
export type TeamRole = "admin" | "manager" | "employee";
