import { Router } from "express";
import { db, teamMembers } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { TEAM_ROLES, ensureTeamMember, requireRole, serializeTeamMember, requireAuth } from "../lib/team";
import type { TeamRole } from "@workspace/db";

const router = Router();

/**
 * Profile + role for the authenticated user. Registers them on first call —
 * shared by both apps so a user signing into either one appears in the
 * admin's user list.
 */
router.get("/me", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const member = await ensureTeamMember(req.userId);
    res.json(serializeTeamMember(member));
  } catch (err) {
    req.log.error({ err }, "Failed to resolve team profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Administration (admin role only) ─────────────────────────────────────────

router.get("/admin/users", requireAuth, requireRole("admin"), async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(teamMembers).orderBy(asc(teamMembers.createdAt));
    res.json(rows.map(serializeTeamMember));
  } catch (err) {
    _req.log.error({ err }, "Failed to list team members");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/users/:clerkUserId", requireAuth, requireRole("admin"), async (req: any, res): Promise<void> => {
  const targetId = req.params.clerkUserId;
  const role = req.body?.role;
  if (typeof role !== "string" || !TEAM_ROLES.includes(role as TeamRole)) {
    res.status(400).json({ error: "role must be one of admin|manager|employee" });
    return;
  }
  // The owner must always keep the admin role — otherwise the project could
  // be left with no administrator at all.
  if (targetId === req.userId) {
    res.status(400).json({ error: "cannot_change_own_role", message: "Нельзя изменить собственную должность" });
    return;
  }
  try {
    const [row] = await db
      .update(teamMembers)
      .set({ role: role as TeamRole })
      .where(eq(teamMembers.clerkUserId, targetId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }
    res.json(serializeTeamMember(row));
  } catch (err) {
    req.log.error({ err }, "Failed to update team member role");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
