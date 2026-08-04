/**
 * Unified team/role registry shared by the Report Tool and the call dashboard.
 *
 * One row per Clerk user in `team_members`, created lazily on first
 * authenticated request to either app. The VERY FIRST registered user becomes
 * "admin" and claims the legacy single-user dashboard rows (id/user_id
 * "default") so the existing owner's data stays attached to them.
 */

import { clerkClient, getAuth } from "@clerk/express";
import { db, teamInvitations, teamMembers, moizvonkiConnections, moizvonkiMetrics, moizvonkiSettings, mangoCredentials } from "@workspace/db";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { TeamInvitation, TeamMember, TeamRole } from "@workspace/db";
import type { RequestHandler } from "express";

export const TEAM_ROLES: readonly TeamRole[] = ["admin", "manager", "employee"];

/** Attach userId to the request or 401. Same pattern as the other routers. */
export const requireAuth: RequestHandler = (req: any, res, next) => {
  const userId = getAuth(req)?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = userId;
  next();
};

export function serializeTeamMember(row: TeamMember) {
  return {
    clerkUserId: row.clerkUserId,
    displayName: row.displayName ?? null,
    email: row.email ?? null,
    role: row.role as TeamRole,
    mangoMemberId: row.mangoMemberId ?? null,
    mangoMemberName: row.mangoMemberName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function normalizeTeamEmail(email: string): string {
  return email.trim().toLocaleLowerCase();
}

export function invitationStatus(row: TeamInvitation, now: Date = new Date()) {
  if (row.revokedAt) return "revoked" as const;
  if (row.acceptedAt) return "accepted" as const;
  if (row.expiresAt <= now) return "expired" as const;
  return "pending" as const;
}

export function serializeTeamInvitation(row: TeamInvitation) {
  return {
    id: row.id,
    email: row.email,
    role: row.role as TeamRole,
    status: invitationStatus(row),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
  };
}

async function fetchClerkProfile(userId: string): Promise<{ displayName: string | null; email: string | null }> {
  try {
    const user = await clerkClient.users.getUser(userId);
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    return {
      displayName: name || user.username || null,
      email: user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null,
    };
  } catch {
    // Profile enrichment is best-effort — registration must not fail on a
    // Clerk API hiccup; name/email can be backfilled on a later request.
    return { displayName: null, email: null };
  }
}

/**
 * Move the legacy single-user rows (id/user_id "default") to the first
 * administrator so their existing connections, metrics history and settings
 * survive the switch to per-user scoping.
 */
/**
 * Return the team_members row for the Clerk user, registering them on first
 * sight. A transaction-scoped PostgreSQL advisory lock serializes bootstrap:
 * exactly one first user becomes admin and atomically claims the legacy rows.
 */
export async function ensureTeamMember(userId: string): Promise<TeamMember> {
  const [existing] = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.clerkUserId, userId))
    .limit(1);
  if (existing) return existing;

  const { displayName, email } = await fetchClerkProfile(userId);
  return db.transaction(async (tx) => {
    // A stable application-specific key. pg_advisory_xact_lock releases on
    // commit/rollback, so no stale lock can block later sign-ins.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(728_412_901)`);

    const [registered] = await tx
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.clerkUserId, userId))
      .limit(1);
    if (registered) return registered;

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(teamMembers);
    // Invitations are intentionally an assignment, not an access gate: people
    // may still sign up normally, but a pre-assigned role applies immediately
    // when their Clerk email first reaches us.
    const activeInvitation = email
      ? (await tx
          .select()
          .from(teamInvitations)
          .where(
            and(
              sql`lower(${teamInvitations.email}) = ${normalizeTeamEmail(email)}`,
              isNull(teamInvitations.acceptedAt),
              isNull(teamInvitations.revokedAt),
              gt(teamInvitations.expiresAt, new Date()),
            ),
          )
          .limit(1))[0] ?? null
      : null;
    const role: TeamRole = count === 0 ? "admin" : (activeInvitation?.role as TeamRole | undefined) ?? "employee";
    const [row] = await tx
      .insert(teamMembers)
      .values({ clerkUserId: userId, displayName, email, role })
      .returning();
    if (!row) throw new Error("team member registration failed");

    if (activeInvitation) {
      await tx
        .update(teamInvitations)
        .set({ acceptedAt: new Date(), acceptedByClerkUserId: userId })
        .where(eq(teamInvitations.id, activeInvitation.id));
    }

    if (role === "admin") {
      // All legacy moves succeed or none do. A freshly registered user cannot
      // have conflicting Мои Звонки rows. Mango can be an exception because
      // Report Tool historically stored its own per-user credential while the
      // dashboard kept a legacy "default" credential. Keep the newer of the
      // two deterministically before moving the legacy row, so an upgrade
      // never blocks the owner's first sign-in on a primary-key collision.
      const [legacyConnection] = await tx
        .select()
        .from(moizvonkiConnections)
        .where(eq(moizvonkiConnections.id, "default"))
        .limit(1);
      const [existingConnection] = await tx
        .select()
        .from(moizvonkiConnections)
        .where(eq(moizvonkiConnections.id, userId))
        .limit(1);
      if (legacyConnection && existingConnection) {
        if (legacyConnection.updatedAt > existingConnection.updatedAt) {
          await tx.delete(moizvonkiConnections).where(eq(moizvonkiConnections.id, userId));
          await tx.update(moizvonkiConnections).set({ id: userId }).where(eq(moizvonkiConnections.id, "default"));
        } else {
          await tx.delete(moizvonkiConnections).where(eq(moizvonkiConnections.id, "default"));
        }
      } else if (legacyConnection) {
        await tx.update(moizvonkiConnections).set({ id: userId }).where(eq(moizvonkiConnections.id, "default"));
      }

      const [legacySettings] = await tx
        .select()
        .from(moizvonkiSettings)
        .where(eq(moizvonkiSettings.id, "default"))
        .limit(1);
      const [existingSettings] = await tx
        .select()
        .from(moizvonkiSettings)
        .where(eq(moizvonkiSettings.id, userId))
        .limit(1);
      if (legacySettings && existingSettings) {
        if (legacySettings.updatedAt > existingSettings.updatedAt) {
          await tx.delete(moizvonkiSettings).where(eq(moizvonkiSettings.id, userId));
          await tx.update(moizvonkiSettings).set({ id: userId }).where(eq(moizvonkiSettings.id, "default"));
        } else {
          await tx.delete(moizvonkiSettings).where(eq(moizvonkiSettings.id, "default"));
        }
      } else if (legacySettings) {
        await tx.update(moizvonkiSettings).set({ id: userId }).where(eq(moizvonkiSettings.id, "default"));
      }

      // The old one-row-per-date table now has (user_id, date) as its key.
      // If a user already has a point for the same day, keep the newest
      // collection result and move only non-conflicting legacy dates.
      const legacyMetrics = await tx
        .select()
        .from(moizvonkiMetrics)
        .where(eq(moizvonkiMetrics.userId, "default"));
      for (const legacyMetric of legacyMetrics) {
        const [existingMetric] = await tx
          .select()
          .from(moizvonkiMetrics)
          .where(
            and(
              eq(moizvonkiMetrics.userId, userId),
              eq(moizvonkiMetrics.date, legacyMetric.date),
            ),
          )
          .limit(1);
        if (existingMetric) {
          if (legacyMetric.updatedAt > existingMetric.updatedAt) {
            await tx
              .update(moizvonkiMetrics)
              .set({
                calls: legacyMetric.calls,
                trafficSeconds: legacyMetric.trafficSeconds,
                source: legacyMetric.source,
                updatedAt: legacyMetric.updatedAt,
              })
              .where(
                and(
                  eq(moizvonkiMetrics.userId, userId),
                  eq(moizvonkiMetrics.date, legacyMetric.date),
                ),
              );
          }
          await tx
            .delete(moizvonkiMetrics)
            .where(
              and(
                eq(moizvonkiMetrics.userId, "default"),
                eq(moizvonkiMetrics.date, legacyMetric.date),
              ),
            );
        } else {
          await tx
            .update(moizvonkiMetrics)
            .set({ userId })
            .where(
              and(
                eq(moizvonkiMetrics.userId, "default"),
                eq(moizvonkiMetrics.date, legacyMetric.date),
              ),
            );
        }
      }

      const [legacyMango] = await tx
        .select()
        .from(mangoCredentials)
        .where(eq(mangoCredentials.userId, "default"))
        .limit(1);
      const [existingMango] = await tx
        .select()
        .from(mangoCredentials)
        .where(eq(mangoCredentials.userId, userId))
        .limit(1);
      if (legacyMango && existingMango) {
        // Newer credentials win; the older row is obsolete and can be removed.
        if (legacyMango.updatedAt > existingMango.updatedAt) {
          await tx.delete(mangoCredentials).where(eq(mangoCredentials.userId, userId));
          await tx.update(mangoCredentials).set({ userId }).where(eq(mangoCredentials.userId, "default"));
        } else {
          await tx.delete(mangoCredentials).where(eq(mangoCredentials.userId, "default"));
        }
      } else if (legacyMango) {
        await tx.update(mangoCredentials).set({ userId }).where(eq(mangoCredentials.userId, "default"));
      }
    }

    return row;
  });
}

/** Middleware: requires an authenticated user AND one of the given roles. */
export function requireRole(...roles: TeamRole[]): RequestHandler {
  return async (req: any, res, next) => {
    try {
      const member = await ensureTeamMember(req.userId);
      req.teamMember = member;
      if (!roles.includes(member.role as TeamRole)) {
        res.status(403).json({ error: "forbidden", message: "Недостаточно прав" });
        return;
      }
      next();
    } catch (err) {
      req.log?.error({ err }, "Failed to resolve team member role");
      res.status(500).json({ error: "Internal server error" });
    }
  };
}
