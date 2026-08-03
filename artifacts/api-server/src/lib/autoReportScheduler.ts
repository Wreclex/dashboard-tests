import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import cron from "node-cron";
import {
  autoReportSchedules,
  db,
  mangoCredentials,
  telegramChannels,
  userReportState,
} from "@workspace/db";
import { decryptToken } from "./encrypt";
import {
  buildReportText,
  formatReportDate,
  type StoredReportState,
  type StoredSignature,
} from "./reportText";
import { getTodaySheetCounts } from "./sheetCounts";
import { logger } from "./logger";
import { getMangoKpi, MangoTokenExpiredError } from "./mangoKpi";
import { formatMangoTraffic } from "./mangoKpiFormat";

let isTickRunning = false;

// External request budgets (each call is aborted at this limit).
const SHEETS_TIMEOUT_MS = 90_000;
const TELEGRAM_TIMEOUT_MS = 90_000;

// Hard wall-clock cap for the entire Mango KPI fetch (handshake + all polls).
// Keeps the total Sheets + Mango time within the initial lease.
const MANGO_SCHEDULER_BUDGET_MS = 30_000;

// How long the initial lease covers: Sheets budget + Mango budget + overhead.
// A peer cannot reclaim before this window expires.
const INITIAL_LEASE_MS = SHEETS_TIMEOUT_MS + MANGO_SCHEDULER_BUDGET_MS + 60_000; // 180 s

// Immediately before the Telegram call we extend the lease so it covers the
// remaining Telegram budget plus small overhead.  This is the "pre-send gate":
// it atomically verifies (token match, not deactivated, lease not already
// expired) AND extends — all in a single UPDATE with no transaction held open.
const PRESEND_LEASE_EXTENSION_MS = TELEGRAM_TIMEOUT_MS + 30_000; // 120 s

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS) });
}

/**
 * Token-fenced lease release.  Only applies when the row still carries our
 * token so a newer claim (from a reclaimed lease) is never clobbered.
 */
async function releaseLease(
  scheduleId: number,
  leaseToken: string,
  updates: Record<string, unknown> = {},
): Promise<void> {
  await db
    .update(autoReportSchedules)
    .set({ ...updates, deliveryLeaseUntil: null, deliveryLeaseToken: null, updatedAt: new Date() })
    .where(
      and(
        eq(autoReportSchedules.id, scheduleId),
        eq(autoReportSchedules.deliveryLeaseToken, leaseToken),
      ),
    );
}

/**
 * Pre-send gate — must be called immediately before the Telegram request.
 *
 * Atomically verifies:
 *   - delivery_lease_token matches our claim
 *   - is_active is still true (not deactivated by PATCH/DELETE)
 *   - delivery_lease_until is still in the future (not expired/reclaimed)
 *
 * On success, extends the lease by PRESEND_LEASE_EXTENSION_MS so it covers the
 * Telegram call duration.  The HTTP call is then made **outside** any DB
 * transaction so no connection is held open during the network wait.
 *
 * Returns true when the gate was acquired; false means abort this delivery.
 */
async function acquirePresendGate(scheduleId: number, leaseToken: string): Promise<boolean> {
  const now = new Date();
  const extended = new Date(now.getTime() + PRESEND_LEASE_EXTENSION_MS);
  const [row] = await db
    .update(autoReportSchedules)
    .set({ deliveryLeaseUntil: extended, updatedAt: now })
    .where(
      and(
        eq(autoReportSchedules.id, scheduleId),
        eq(autoReportSchedules.isActive, true),
        eq(autoReportSchedules.deliveryLeaseToken, leaseToken),
        // Lease must still be valid at this moment
        gt(autoReportSchedules.deliveryLeaseUntil, now),
      ),
    )
    .returning({ id: autoReportSchedules.id });
  return Boolean(row);
}

async function sendDueReports(): Promise<void> {
  if (isTickRunning) return;
  isTickRunning = true;
  try {
    const now = new Date();
    const schedules = await db
      .select()
      .from(autoReportSchedules)
      .where(eq(autoReportSchedules.isActive, true));

    for (const schedule of schedules) {
      if (!schedule.nextRunAt || schedule.nextRunAt > now) continue;
      let leaseToken: string | null = null;
      try {
        leaseToken = randomUUID();
        // Atomic claim: only succeeds when no other worker holds a valid lease
        // AND the schedule is still genuinely due (nextRunAt <= now).
        //
        // The `nextRunAt <= now` predicate is the critical configuration fence:
        // every delivery-changing PATCH advances nextRunAt into the future, so a
        // stale worker that read an old channelId/reportType cannot claim a row
        // whose nextRunAt has already been reset by that PATCH.
        //
        // Linearization point for the gate-to-HTTP window: once
        // acquirePresendGate succeeds, any concurrent PATCH/DELETE that commits
        // after the gate has its changes take effect from the NEXT scheduled
        // delivery.  A send already admitted at the gate will complete using the
        // configuration that was current at gate time; this is the defined
        // serialization boundary and is explicitly accepted.
        const [claimed] = await db
          .update(autoReportSchedules)
          .set({
            deliveryLeaseUntil: new Date(now.getTime() + INITIAL_LEASE_MS),
            deliveryLeaseToken: leaseToken,
            nextRunAt: new Date(now.getTime() + schedule.intervalMinutes * 60_000),
            updatedAt: now,
          })
          .where(
            and(
              eq(autoReportSchedules.id, schedule.id),
              eq(autoReportSchedules.isActive, true),
              // nextRunAt must still be due — prevents claiming a row that a
              // concurrent PATCH already reset to the future.
              lte(autoReportSchedules.nextRunAt, now),
              or(
                isNull(autoReportSchedules.deliveryLeaseUntil),
                lte(autoReportSchedules.deliveryLeaseUntil, now),
              ),
            ),
          )
          .returning({ id: autoReportSchedules.id });
        if (!claimed) continue;

        // Load user state and channel (outside any transaction).
        const [stored] = await db
          .select()
          .from(userReportState)
          .where(eq(userReportState.userId, schedule.userId))
          .limit(1);
        const [channel] = await db
          .select()
          .from(telegramChannels)
          .where(
            and(
              eq(telegramChannels.id, schedule.channelId),
              eq(telegramChannels.userId, schedule.userId),
            ),
          )
          .limit(1);
        if (!stored || !channel) {
          logger.warn({ scheduleId: schedule.id }, "Incomplete schedule — deactivating");
          await releaseLease(schedule.id, leaseToken, { isActive: false, nextRunAt: null });
          continue;
        }

        // Build report text, optionally refreshing counters from Sheets and Mango.
        const state = stored.state as StoredReportState;
        const signature = stored.signature as StoredSignature;
        try {
          const counts = await getTodaySheetCounts(
            signature.tag1.replace(/^#/, "").trim(),
          );
          Object.assign(state, counts);
        } catch (err) {
          logger.warn({ err, scheduleId: schedule.id }, "Using saved counters — Sheets sync failed");
        }
        try {
          const [mangoCredential] = await db
            .select({ bearerToken: mangoCredentials.bearerToken })
            .from(mangoCredentials)
            .where(eq(mangoCredentials.userId, schedule.userId))
            .limit(1);
          if (mangoCredential) {
            const mango = await getMangoKpi(mangoCredential.bearerToken, {
              totalTimeoutMs: MANGO_SCHEDULER_BUDGET_MS,
            });
            state.kz = mango.calls;
            state.trafikCurrent = formatMangoTraffic(mango.trafficSeconds);
            await db
              .update(userReportState)
              .set({ state, updatedAt: new Date() })
              .where(eq(userReportState.userId, schedule.userId));
          }
        } catch (err) {
          const message = err instanceof MangoTokenExpiredError
            ? "Mango Office token expired — using saved KPI"
            : "Mango Office KPI sync failed — using saved KPI";
          logger.warn({ err, scheduleId: schedule.id }, message);
        }

        // Pre-send gate: verify token + active + unexpired lease; extend to
        // cover Telegram budget.  No DB transaction is held past this point.
        const gateAcquired = await acquirePresendGate(schedule.id, leaseToken);
        if (!gateAcquired) {
          logger.info({ scheduleId: schedule.id }, "Delivery aborted — schedule changed or lease expired");
          continue;
        }

        // Telegram call is made with NO open DB transaction.
        const tgRes = await fetchWithTimeout(
          `https://api.telegram.org/bot${decryptToken(channel.botToken)}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: channel.chatId,
              text: buildReportText(schedule.reportType, state, signature, formatReportDate(new Date())),
            }),
          },
        );

        if (!tgRes.ok) {
          logger.warn({ scheduleId: schedule.id, status: tgRes.status }, "Telegram auto-report failed");
          await releaseLease(schedule.id, leaseToken);
          continue;
        }

        await releaseLease(schedule.id, leaseToken, { lastSentAt: new Date() });
        logger.info({ scheduleId: schedule.id }, "Sent scheduled Telegram report");
      } catch (err) {
        logger.error({ err, scheduleId: schedule.id }, "Failed scheduled Telegram report");
        if (leaseToken) {
          await releaseLease(schedule.id, leaseToken).catch((e) =>
            logger.error({ err: e, scheduleId: schedule.id }, "Failed to release report lease"),
          );
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Auto-report scheduler tick failed");
  } finally {
    isTickRunning = false;
  }
}

export function startAutoReportScheduler(): void {
  cron.schedule("* * * * *", () => void sendDueReports(), { timezone: "Europe/Moscow" });
  logger.info("Auto-report scheduler started");
}
