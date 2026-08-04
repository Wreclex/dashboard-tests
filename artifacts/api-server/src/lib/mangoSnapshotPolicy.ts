/**
 * When a Mango read may talk to Mango, and how long it is allowed to wait.
 *
 * Kept free of database and network imports so the rule that matters — a
 * client-facing read never blocks on Mango — can be tested directly.
 */

/** Connection state as reported to the UI. */
export type MangoSessionState = "ok" | "refreshing" | "reauth_required" | "unavailable";

export type MangoSessionInfo = {
  state: MangoSessionState;
  message: string | null;
  checkedAt: Date | null;
};

/** A snapshot older than this triggers a background refresh. */
export const SNAPSHOT_TTL_MS = 2 * 60_000;
/** How long a request may wait for a refresh when there is nothing to show yet. */
export const FIRST_LOAD_GRACE_MS = 9_000;
/** Data read with the cached session — no headless login inside this budget. */
export const FAST_READ_BUDGET_MS = 35_000;
/** Full re-login (browser) plus the report read that follows it. */
export const RELOGIN_BUDGET_MS = 150_000;
/** Do not hammer Mango with automatic retries after a failure. */
const RETRY_AFTER_MS: Record<MangoSessionState, number> = {
  ok: 0,
  refreshing: 0,
  reauth_required: 10 * 60_000,
  unavailable: 60_000,
};

export function readSessionInfo(credential: {
  sessionState: string | null;
  sessionError: string | null;
  sessionCheckedAt: Date | null;
}): MangoSessionInfo {
  const raw = credential.sessionState;
  const state: MangoSessionState =
    raw === "ok" || raw === "refreshing" || raw === "reauth_required" || raw === "unavailable"
      ? raw
      : "ok";
  return { state, message: credential.sessionError, checkedAt: credential.sessionCheckedAt };
}

export function isCoolingDown(info: MangoSessionInfo, now: number = Date.now()): boolean {
  const wait = RETRY_AFTER_MS[info.state];
  if (!wait || !info.checkedAt) return false;
  return now - info.checkedAt.getTime() < wait;
}

/** What a snapshot read decided to do. Returned so tests can assert it. */
export type EnsureOutcome =
  | "fresh" // snapshot is current — nothing to do
  | "cooling_down" // last attempt failed recently — do not retry yet
  | "stale_while_revalidate" // serve the old numbers, refresh in the background
  | "waited"; // nothing cached — waited up to the grace period

/**
 * The bounded read at the heart of every Mango endpoint, with its inputs
 * injected so it can be exercised without a database or a real Mango.
 *
 * The one guarantee that matters: this never waits longer than `graceMs`, no
 * matter how slow (or hung) the refresh is.
 */
export async function ensureSnapshotWithin(deps: {
  info: MangoSessionInfo;
  snapshot: { fetchedAt: Date } | null;
  isRefreshing: boolean;
  start: () => Promise<void>;
  force?: boolean;
  graceMs?: number;
  ttlMs?: number;
  now?: number;
}): Promise<EnsureOutcome> {
  const now = deps.now ?? Date.now();
  const ttl = deps.ttlMs ?? SNAPSHOT_TTL_MS;
  const grace = deps.graceMs ?? FIRST_LOAD_GRACE_MS;
  const isFresh = deps.snapshot !== null && now - deps.snapshot.fetchedAt.getTime() < ttl;

  if (!deps.force) {
    if (isFresh && deps.info.state === "ok") return "fresh";
    if (!deps.isRefreshing && isCoolingDown(deps.info, now)) return "cooling_down";
  }

  const refresh = deps.start();
  refresh.catch(() => {}); // the caller may walk away from it
  if (deps.snapshot && !deps.force) return "stale_while_revalidate";

  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    refresh,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, grace);
    }),
  ]);
  if (timer) clearTimeout(timer);
  return "waited";
}
