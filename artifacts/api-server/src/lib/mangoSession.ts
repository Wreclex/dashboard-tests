/**
 * Snapshot-backed Mango access for every client-facing Mango read.
 *
 * A Mango KPI read is slow and occasionally very slow: the report handshake
 * plus polling can take tens of seconds, and a re-login adds up to a minute of
 * headless browser work on top. Doing that inside a request means the caller
 * spins for over a minute and then fails — which is exactly what users saw.
 *
 * So requests never drive Mango directly. They read the last stored snapshot
 * and, when it is stale, kick off a background refresh. A first-ever load waits
 * a few seconds for that refresh so the common fast case still returns data,
 * but it always answers within a bounded time and always says which state the
 * connection is in.
 *
 * Two flavours share this machinery:
 *  - the dashboard's ONE shared team connection, where a single report already
 *    returns a row per operator (so one refresh fills the team snapshot AND
 *    every operator's personal snapshot);
 *  - the Report Tool's per-user connection, which reads only its own KPI.
 */

import { db, mangoCredentials, mangoKpiSnapshots } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  FAST_READ_BUDGET_MS,
  RELOGIN_BUDGET_MS,
  ensureSnapshotWithin,
  isCoolingDown,
  readSessionInfo,
  type MangoSessionInfo,
  type MangoSessionState,
} from "./mangoSnapshotPolicy.ts";
import {
  MangoAuthError,
  MangoKpiUnavailableError,
  MangoTokenExpiredError,
  getMangoKpi,
  getMangoTeamKpi,
  type MangoFetchOptions,
  type MangoMemberKpi,
  type MangoStoredCredential,
} from "./mangoKpi.ts";

export type MangoTeamSnapshot = {
  members: MangoMemberKpi[];
  totalCalls: number;
  totalTrafficSeconds: number;
};

export type MangoMemberSnapshot = { calls: number; trafficSeconds: number };

/** Snapshot keys. The shared team report and its per-operator fan-out. */
const TEAM_KEY = "team";
const memberKey = (memberId: number) => `member:${memberId}`;
/** Snapshot key for a Report Tool user's own Mango connection. */
const userKey = (userId: string) => `user:${userId}`;

// Re-exported so callers keep a single import for Mango session concerns.
export { FIRST_LOAD_GRACE_MS, readSessionInfo } from "./mangoSnapshotPolicy.ts";
export type { EnsureOutcome, MangoSessionInfo, MangoSessionState } from "./mangoSnapshotPolicy.ts";

// ── Snapshot storage ─────────────────────────────────────────────────────────

type StoredSnapshot<T> = { data: T; fetchedAt: Date };

async function readSnapshot<T>(key: string): Promise<StoredSnapshot<T> | null> {
  const [row] = await db
    .select()
    .from(mangoKpiSnapshots)
    .where(eq(mangoKpiSnapshots.key, key))
    .limit(1);
  if (!row) return null;
  try {
    return { data: JSON.parse(row.payload) as T, fetchedAt: row.fetchedAt };
  } catch {
    // A corrupted row must not break the dashboard — treat it as missing.
    return null;
  }
}

async function writeSnapshot(key: string, data: unknown, fetchedAt: Date): Promise<void> {
  const payload = JSON.stringify(data);
  await db
    .insert(mangoKpiSnapshots)
    .values({ key, payload, fetchedAt })
    .onConflictDoUpdate({ target: mangoKpiSnapshots.key, set: { payload, fetchedAt } });
}

export function readTeamSnapshot(): Promise<StoredSnapshot<MangoTeamSnapshot> | null> {
  return readSnapshot<MangoTeamSnapshot>(TEAM_KEY);
}

export function readMemberSnapshot(
  memberId: number,
): Promise<StoredSnapshot<MangoMemberSnapshot> | null> {
  return readSnapshot<MangoMemberSnapshot>(memberKey(memberId));
}

export function readUserSnapshot(
  userId: string,
): Promise<StoredSnapshot<MangoMemberSnapshot> | null> {
  return readSnapshot<MangoMemberSnapshot>(userKey(userId));
}

/** Drop every cached report — used when the shared connection is removed. */
export async function clearMangoSnapshots(): Promise<void> {
  await db.delete(mangoKpiSnapshots);
}

/** Drop one user's cached report when they disconnect their own Mango. */
export async function clearUserMangoSnapshot(userId: string): Promise<void> {
  await db.delete(mangoKpiSnapshots).where(eq(mangoKpiSnapshots.key, userKey(userId)));
}

// ── Session state ────────────────────────────────────────────────────────────

async function writeSessionState(
  userId: string,
  state: MangoSessionState,
  message: string | null,
): Promise<void> {
  try {
    await db
      .update(mangoCredentials)
      .set({ sessionState: state, sessionError: message, sessionCheckedAt: new Date() })
      .where(eq(mangoCredentials.userId, userId));
  } catch {
    // State reporting is best-effort; the snapshot itself is what matters.
  }
}

// ── Background refresh ───────────────────────────────────────────────────────

export type RefreshCredential = MangoStoredCredential & {
  userId: string;
  sessionState: string | null;
  sessionError: string | null;
  sessionCheckedAt: Date | null;
};

/** One background refresh at a time per snapshot key, per process. */
const refreshInFlight = new Map<string, Promise<void>>();

/**
 * Read Mango with the cached session first and only fall back to the slow
 * headless login when Mango actually rejects the stored token.
 */
async function withSessionTiers<T>(
  credential: RefreshCredential,
  load: (opts: MangoFetchOptions) => Promise<T>,
): Promise<T> {
  try {
    return await load({
      userId: credential.userId,
      totalTimeoutMs: FAST_READ_BUDGET_MS,
      skipRelogin: true,
    });
  } catch (err) {
    if (!(err instanceof MangoTokenExpiredError)) throw err;
    return await load({
      userId: credential.userId,
      totalTimeoutMs: RELOGIN_BUDGET_MS,
      forceRelogin: true,
    });
  }
}

async function runRefresh<T>(
  credential: RefreshCredential,
  load: (opts: MangoFetchOptions) => Promise<T>,
  store: (data: T, fetchedAt: Date) => Promise<void>,
): Promise<void> {
  await writeSessionState(credential.userId, "refreshing", null);
  try {
    const data = await withSessionTiers(credential, load);
    await store(data, new Date());
    await writeSessionState(credential.userId, "ok", null);
  } catch (err) {
    if (err instanceof MangoAuthError) {
      await writeSessionState(credential.userId, "reauth_required", err.message);
      return;
    }
    const message =
      err instanceof MangoKpiUnavailableError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Неизвестная ошибка Mango";
    await writeSessionState(credential.userId, "unavailable", message);
  }
}

function startRefresh(refreshKey: string, run: () => Promise<void>): Promise<void> {
  const running = refreshInFlight.get(refreshKey);
  if (running) return running;
  const started = run().finally(() => {
    refreshInFlight.delete(refreshKey);
  });
  refreshInFlight.set(refreshKey, started);
  // The refresh outlives the request that started it; swallow rejections here
  // so an unawaited copy can never crash the process.
  started.catch(() => {});
  return started;
}

export function isMangoRefreshRunning(refreshKey: string = TEAM_KEY): boolean {
  return refreshInFlight.has(refreshKey);
}

export function isUserMangoRefreshRunning(userId: string): boolean {
  return refreshInFlight.has(userKey(userId));
}

/**
 * Start (or join) the shared team refresh. Resolves when that refresh
 * finishes — callers that must stay fast should race it against a timeout.
 */
export function refreshMangoSnapshots(credential: RefreshCredential): Promise<void> {
  return startRefresh(TEAM_KEY, () =>
    runRefresh(
      credential,
      (opts) => getMangoTeamKpi(credential, opts),
      async (members, fetchedAt) => {
        const team: MangoTeamSnapshot = {
          members,
          totalCalls: members.reduce((sum, m) => sum + m.calls, 0),
          totalTrafficSeconds: members.reduce((sum, m) => sum + m.trafficSeconds, 0),
        };
        await writeSnapshot(TEAM_KEY, team, fetchedAt);
        // One report covers every operator — fan it out so personal cards
        // render instantly too.
        for (const member of members) {
          await writeSnapshot(
            memberKey(member.memberId),
            { calls: member.calls, trafficSeconds: member.trafficSeconds },
            fetchedAt,
          );
        }
      },
    ),
  );
}

/** Start (or join) the refresh of one user's own Mango KPI (Report Tool). */
export function refreshUserMangoSnapshot(credential: RefreshCredential): Promise<void> {
  return startRefresh(userKey(credential.userId), () =>
    runRefresh(
      credential,
      (opts) => getMangoKpi(credential, opts),
      (kpi, fetchedAt) =>
        writeSnapshot(
          userKey(credential.userId),
          { calls: kpi.calls, trafficSeconds: kpi.trafficSeconds },
          fetchedAt,
        ),
    ),
  );
}

/**
 * Make sure a snapshot is reasonably current before a request reads it.
 *
 * - Fresh snapshot → returns immediately.
 * - Stale snapshot → refresh in the background, return the old numbers now.
 * - No snapshot    → wait a few seconds for the refresh, then answer regardless.
 *
 * `force` (explicit reconnect) bypasses both freshness and the failure cooldown.
 */
async function ensureSnapshot(
  credential: RefreshCredential,
  refreshKey: string,
  hasSnapshot: () => Promise<StoredSnapshot<unknown> | null>,
  start: () => Promise<void>,
  opts?: { force?: boolean },
): Promise<void> {
  await ensureSnapshotWithin({
    info: readSessionInfo(credential),
    snapshot: await hasSnapshot(),
    isRefreshing: refreshInFlight.has(refreshKey),
    start,
    force: opts?.force,
  });
}

export function ensureMangoSnapshots(
  credential: RefreshCredential,
  opts?: { force?: boolean },
): Promise<void> {
  return ensureSnapshot(
    credential,
    TEAM_KEY,
    readTeamSnapshot,
    () => refreshMangoSnapshots(credential),
    opts,
  );
}

export function ensureUserMangoSnapshot(
  credential: RefreshCredential,
  opts?: { force?: boolean },
): Promise<void> {
  return ensureSnapshot(
    credential,
    userKey(credential.userId),
    () => readUserSnapshot(credential.userId),
    () => refreshUserMangoSnapshot(credential),
    opts,
  );
}
