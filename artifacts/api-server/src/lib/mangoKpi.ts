/**
 * Mango Office KPI entry point — three-tier auth:
 *
 * 1. Cached auth_token from the DB (fast path).
 * 2. On 401/403: refresh_token via auth.mango-office.ru/refresh.
 * 3. On refresh failure: full headless-browser re-login with the stored
 *    email + password (mangoBrowserLogin), then retry.
 *
 * New tokens are persisted back to mango_credentials whenever we have a userId.
 */

import { decryptToken, encryptToken } from "./encrypt.ts";
import { mangoRefresh, MangoAuthError } from "./mangoAuth.ts";
import { mangoBrowserLogin } from "./mangoBrowser.ts";
import {
  MANGO_RESULT_POLL_DELAY_MS,
  MangoKpiUnavailableError,
  MangoTokenExpiredError,
  fetchMangoKpi,
  type MangoKpi,
} from "./mangoKpiFormat.ts";
import { db, mangoCredentials } from "@workspace/db";
import { eq } from "drizzle-orm";

export {
  MANGO_KPI_RESULT_URL,
  MANGO_KPI_URL,
  MangoKpiUnavailableError,
  MangoTokenExpiredError,
  fetchMangoKpi,
  formatMangoTraffic,
  todayMoscow,
  type FetchFn,
} from "./mangoKpiFormat.ts";
export type { MangoKpi } from "./mangoKpiFormat.ts";
export { MangoAuthError } from "./mangoAuth.ts";
export { mangoBrowserLogin } from "./mangoBrowser.ts";

/** Single-flight guard: concurrent KPI calls for one user share one browser login. */
const loginInFlight = new Map<string, Promise<{ authToken: string; refreshToken: string }>>();

export type MangoStoredCredential = {
  /** Encrypted email, encrypted password, encrypted tokens (or null). */
  email: string;
  password: string;
  authToken: string | null;
  refreshToken: string | null;
};

async function persistTokens(
  userId: string | undefined,
  authToken: string,
  refreshToken: string,
): Promise<void> {
  if (!userId) return;
  try {
    await db
      .update(mangoCredentials)
      .set({
        authToken: encryptToken(authToken),
        refreshToken: encryptToken(refreshToken),
        updatedAt: new Date(),
      })
      .where(eq(mangoCredentials.userId, userId));
  } catch {
    // Non-fatal — KPI still returned; next run will re-auth.
  }
}

function decryptPlain(encrypted: string | null): string {
  if (!encrypted) return "";
  return decryptToken(encrypted).trim();
}

/**
 * Fetch today's call count + traffic from Mango CCC.
 *
 * @throws MangoAuthError           — credentials rejected; user must re-enter
 * @throws MangoKpiUnavailableError — transient / infrastructure failures
 */
export async function getMangoKpi(
  credential: MangoStoredCredential,
  opts?: { totalTimeoutMs?: number; userId?: string },
): Promise<MangoKpi> {
  const started = Date.now();
  const remaining = () =>
    opts?.totalTimeoutMs ? Math.max(0, opts.totalTimeoutMs - (Date.now() - started)) : undefined;

  // ── 1. Cached auth_token ──────────────────────────────────────────────────
  const cachedAuth = decryptPlain(credential.authToken);
  if (cachedAuth && !cachedAuth.split("").some((c) => c.charCodeAt(0) > 127)) {
    try {
      return await fetchMangoKpi(cachedAuth, fetch, MANGO_RESULT_POLL_DELAY_MS, remaining());
    } catch (err) {
      if (!(err instanceof MangoTokenExpiredError)) throw err;
    }
  }

  // ── 2. Refresh token ──────────────────────────────────────────────────────
  const refreshToken = decryptPlain(credential.refreshToken);
  if (refreshToken) {
    try {
      const refreshed = await mangoRefresh(refreshToken);
      await persistTokens(opts?.userId, refreshed.authToken, refreshed.refreshToken);
      return await fetchMangoKpi(
        refreshed.authToken,
        fetch,
        MANGO_RESULT_POLL_DELAY_MS,
        remaining(),
      );
    } catch (err) {
      if (err instanceof MangoTokenExpiredError) throw err; // fresh token rejected — bail
      if (!(err instanceof MangoAuthError)) throw err;      // network etc. — bail
      // Refresh token dead — fall through to browser re-login.
    }
  }

  // ── 3. Headless-browser re-login ──────────────────────────────────────────
  const email = decryptPlain(credential.email);
  const password = decryptPlain(credential.password);
  if (!email || !password) {
    throw new MangoAuthError("Данные Mango не заданы — введите логин и пароль");
  }

  // Browser login takes up to ~60s; skip it when the caller's budget is nearly spent.
  const budget = remaining();
  if (budget !== undefined && budget < 65_000) {
    throw new MangoKpiUnavailableError("Mango session expired — no time left to re-login, try again");
  }

  const lockKey = opts?.userId ?? email;
  let loginPromise = loginInFlight.get(lockKey);
  if (!loginPromise) {
    loginPromise = mangoBrowserLogin(email, password, budget ?? 60_000);
    loginInFlight.set(lockKey, loginPromise);
    loginPromise.finally(() => loginInFlight.delete(lockKey)).catch(() => {});
  }
  const tokens = await loginPromise;

  await persistTokens(opts?.userId, tokens.authToken, tokens.refreshToken);
  return fetchMangoKpi(tokens.authToken, fetch, MANGO_RESULT_POLL_DELAY_MS, remaining());
}
