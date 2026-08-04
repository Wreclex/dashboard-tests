import { Router } from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db, teamInvitations, teamMembers } from "@workspace/db";
import { and, asc, desc, eq, gt, isNull, ne } from "drizzle-orm";
import {
  TEAM_ROLES,
  ensureTeamMember,
  normalizeTeamEmail,
  requireRole,
  serializeTeamInvitation,
  serializeTeamMember,
  requireAuth,
} from "../lib/team";
import type { TeamRole } from "@workspace/db";
import { readTeamSnapshot } from "../lib/mangoSession";

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

/**
 * Admin-controlled operator assignment is useful during initial setup. It
 * deliberately verifies the operator against the most recently cached shared
 * Mango report and relies on the database unique index for race safety.
 */
router.patch("/admin/users/:clerkUserId/operator", requireAuth, requireRole("admin"), async (req: any, res): Promise<void> => {
  const targetId = req.params.clerkUserId;
  const { mangoMemberId, mangoMemberName } = req.body ?? {};
  const wantsUnbind = mangoMemberId === null && mangoMemberName === null;
  if (
    !wantsUnbind &&
    (!Number.isInteger(mangoMemberId) || mangoMemberId <= 0 || typeof mangoMemberName !== "string" || !mangoMemberName.trim())
  ) {
    res.status(400).json({ error: "mangoMemberId and mangoMemberName must both be set, or both be null" });
    return;
  }

  try {
    if (!wantsUnbind) {
      const snapshot = await readTeamSnapshot();
      const known = snapshot?.data.members.find((member) => member.memberId === mangoMemberId);
      if (!known) {
        res.status(400).json({
          error: "unknown_mango_operator",
          message: "Оператор не найден в доступном списке Mango. Сначала обновите подключение Mango.",
        });
        return;
      }
      const [occupied] = await db
        .select({ clerkUserId: teamMembers.clerkUserId })
        .from(teamMembers)
        .where(and(eq(teamMembers.mangoMemberId, mangoMemberId), ne(teamMembers.clerkUserId, targetId)))
        .limit(1);
      if (occupied) {
        res.status(409).json({ error: "operator_already_claimed", message: "Этот оператор уже привязан к другому пользователю" });
        return;
      }
    }

    const [row] = await db
      .update(teamMembers)
      .set({
        mangoMemberId: wantsUnbind ? null : mangoMemberId,
        mangoMemberName: wantsUnbind ? null : mangoMemberName.trim(),
      })
      .where(eq(teamMembers.clerkUserId, targetId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }
    res.json(serializeTeamMember(row));
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      res.status(409).json({ error: "operator_already_claimed", message: "Этот оператор уже привязан к другому пользователю" });
      return;
    }
    req.log.error({ err }, "Failed to update team member Mango operator");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Invitations (admin role only) ────────────────────────────────────────────

const INVITATION_LIFETIME_DAYS = 14;
const hashInvitationToken = (token: string) => createHash("sha256").update(token).digest("hex");

router.get("/admin/invitations", requireAuth, requireRole("admin"), async (req: any, res): Promise<void> => {
  try {
    const rows = await db.select().from(teamInvitations).orderBy(desc(teamInvitations.createdAt));
    res.json(rows.map(serializeTeamInvitation));
  } catch (err) {
    req.log.error({ err }, "Failed to list team invitations");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/invitations", requireAuth, requireRole("admin"), async (req: any, res): Promise<void> => {
  const email = typeof req.body?.email === "string" ? normalizeTeamEmail(req.body.email) : "";
  const role = req.body?.role;
  if (!email || !email.includes("@") || !TEAM_ROLES.includes(role as TeamRole)) {
    res.status(400).json({ error: "A valid email and role are required" });
    return;
  }

  try {
    const [existingMember] = await db
      .select({ clerkUserId: teamMembers.clerkUserId })
      .from(teamMembers)
      .where(eq(teamMembers.email, email))
      .limit(1);
    if (existingMember) {
      res.status(409).json({ error: "member_already_registered", message: "Этот человек уже есть в команде — измените роль в списке участников." });
      return;
    }

    // Replace a previous pending invitation for this address, so the copied
    // link always contains the only valid secret.
    await db
      .update(teamInvitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(teamInvitations.email, email),
          isNull(teamInvitations.acceptedAt),
          isNull(teamInvitations.revokedAt),
          gt(teamInvitations.expiresAt, new Date()),
        ),
      );

    const token = randomBytes(24).toString("base64url");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_DAYS * 24 * 60 * 60_000);
    const [row] = await db
      .insert(teamInvitations)
      .values({
        id: randomUUID(),
        email,
        role: role as TeamRole,
        tokenHash: hashInvitationToken(token),
        invitedBy: req.userId,
        expiresAt,
      })
      .returning();

    res.status(201).json({ ...serializeTeamInvitation(row!), token });
  } catch (err) {
    req.log.error({ err }, "Failed to create team invitation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/invitations/:id", requireAuth, requireRole("admin"), async (req: any, res): Promise<void> => {
  try {
    const [row] = await db
      .update(teamInvitations)
      .set({ revokedAt: new Date() })
      .where(and(eq(teamInvitations.id, req.params.id), isNull(teamInvitations.acceptedAt), isNull(teamInvitations.revokedAt)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "invitation_not_found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to revoke team invitation");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
