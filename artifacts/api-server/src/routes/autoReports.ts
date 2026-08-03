import { Router } from "express";
import { getAuth } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import {
  autoReportSchedules,
  db,
  telegramChannels,
  userReportState,
} from "@workspace/db";
import {
  CreateAutoReportScheduleBody,
  SaveUserReportStateBody,
  UpdateAutoReportScheduleBody,
} from "@workspace/api-zod";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  const userId = getAuth(req)?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  next();
}

function serializeSchedule(schedule: typeof autoReportSchedules.$inferSelect) {
  return {
    id: schedule.id,
    channelId: schedule.channelId,
    intervalMinutes: schedule.intervalMinutes,
    reportType: schedule.reportType,
    isActive: schedule.isActive,
    lastSentAt: schedule.lastSentAt?.toISOString() ?? null,
    createdAt: schedule.createdAt.toISOString(),
    updatedAt: schedule.updatedAt.toISOString(),
  };
}

function getNextRunAt(intervalMinutes: number): Date {
  return new Date(Date.now() + intervalMinutes * 60_000);
}

async function channelBelongsToUser(channelId: number, userId: string) {
  const [channel] = await db
    .select({ id: telegramChannels.id })
    .from(telegramChannels)
    .where(and(eq(telegramChannels.id, channelId), eq(telegramChannels.userId, userId)))
    .limit(1);
  return Boolean(channel);
}

function getExistingIntervalMinutes(schedule: typeof autoReportSchedules.$inferSelect | undefined): number {
  return schedule?.intervalMinutes ?? 5;
}

router.post("/state", requireAuth, async (req: any, res) => {
  const parsed = SaveUserReportStateBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  try {
    await db
      .insert(userReportState)
      .values({ userId: req.userId, state: parsed.data.state, signature: parsed.data.signature })
      .onConflictDoUpdate({
        target: userReportState.userId,
        set: { state: parsed.data.state, signature: parsed.data.signature, updatedAt: new Date() },
      });
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to save report state");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/auto-reports", requireAuth, async (req: any, res) => {
  try {
    const [schedule] = await db
      .select()
      .from(autoReportSchedules)
      .where(eq(autoReportSchedules.userId, req.userId))
      .limit(1);
    return res.json(schedule ? serializeSchedule(schedule) : null);
  } catch (err) {
    req.log.error({ err }, "Failed to get auto-report schedule");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auto-reports", requireAuth, async (req: any, res) => {
  const parsed = CreateAutoReportScheduleBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  try {
    if (!(await channelBelongsToUser(parsed.data.channelId, req.userId))) {
      return res.status(400).json({ error: "Channel not found" });
    }
    const [schedule] = await db
      .insert(autoReportSchedules)
      .values({
        userId: req.userId,
        ...parsed.data,
        nextRunAt: parsed.data.isActive ? getNextRunAt(parsed.data.intervalMinutes) : null,
      })
      .onConflictDoUpdate({
        target: autoReportSchedules.userId,
        set: {
          ...parsed.data,
          nextRunAt: parsed.data.isActive ? getNextRunAt(parsed.data.intervalMinutes) : null,
          deliveryLeaseUntil: null,
          deliveryLeaseToken: null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return res.json(serializeSchedule(schedule));
  } catch (err) {
    req.log.error({ err }, "Failed to save auto-report schedule");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/auto-reports", requireAuth, async (req: any, res) => {
  const parsed = UpdateAutoReportScheduleBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  try {
    if (parsed.data.channelId && !(await channelBelongsToUser(parsed.data.channelId, req.userId))) {
      return res.status(400).json({ error: "Channel not found" });
    }
    const [existing] = await db
      .select()
      .from(autoReportSchedules)
      .where(eq(autoReportSchedules.userId, req.userId))
      .limit(1);
    if (!existing) return res.status(404).json({ error: "Schedule not found" });

    const intervalMinutes = parsed.data.intervalMinutes ?? getExistingIntervalMinutes(existing);
    // Always invalidate any in-flight lease when configuration changes so that
    // the scheduler's SELECT FOR UPDATE token check aborts stale deliveries.
    const leaseReset = { deliveryLeaseUntil: null, deliveryLeaseToken: null } as const;
    const [schedule] = await db
      .update(autoReportSchedules)
      .set({
        ...parsed.data,
        ...(parsed.data.isActive === false
          ? { ...leaseReset, nextRunAt: null }
          : { ...leaseReset, nextRunAt: getNextRunAt(intervalMinutes) }),
        updatedAt: new Date(),
      })
      .where(eq(autoReportSchedules.userId, req.userId))
      .returning();
    return res.json(serializeSchedule(schedule));
  } catch (err) {
    req.log.error({ err }, "Failed to update auto-report schedule");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/auto-reports", requireAuth, async (req: any, res) => {
  try {
    const [schedule] = await db
      .update(autoReportSchedules)
      .set({ isActive: false, nextRunAt: null, deliveryLeaseUntil: null, deliveryLeaseToken: null, updatedAt: new Date() })
      .where(eq(autoReportSchedules.userId, req.userId))
      .returning();
    if (!schedule) return res.status(404).json({ error: "Schedule not found" });
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to deactivate auto-report schedule");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;