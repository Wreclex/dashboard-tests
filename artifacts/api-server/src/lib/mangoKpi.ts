/**
 * Mango Office KPI entry point — two-tier auth:
 *
 * 1. Cached RS256 jwt_token + operator groups from the DB (fast path).
 * 2. On rejection: full headless-browser re-login with the stored
 *    email + password (mangoBrowserLogin), harvesting a fresh jwt_token
 *    and the operator group IDs from localStorage, then retry.
 *
 * The legacy refresh_token tier was removed: Mango refresh tokens cannot
 * mint the RS256 jwt_token that api2.mangotele.com requires (the HS256
 * auth_token is rejected with "Incorrect key for this algorithm").
 *
 * New sessions are persisted back to mango_credentials whenever we have a userId.
 */

import { decryptToken, encryptToken } from "./encrypt.ts";
import { MangoAuthError } from "./mangoAuth.ts";
import { mangoBrowserLogin, type MangoBrowserSession } from "./mangoBrowser.ts";
import {
  MANGO_RESULT_POLL_DELAY_MS,
  MangoKpiUnavailableError,
  MangoTokenExpiredError,
  fetchMangoKpi,
  fetchMangoTeamKpi,
  parseOperatorGroups,
  type MangoKpi,
  type MangoMemberKpi,
} from "./mangoKpiFormat.ts";
import { db, mangoCredentials } from "@workspace/db";
import { eq } from "drizzle-orm";

export {
  MANGO_KPI_RESULT_URL,
  MANGO_KPI_URL,
  MangoKpiUnavailableError,
  MangoTokenExpiredError,
  fetchMangoKpi,
  fetchMangoTeamKpi,
  formatMangoTraffic,
  parseOperatorGroups,
  todayMoscow,
  type FetchFn,
} from "./mangoKpiFormat.ts";
export type { MangoKpi, MangoMemberKpi } from "./mangoKpiFormat.ts";
export { MangoAuthError } from "./mangoAuth.ts";
export { mangoBrowserLogin } from "./mangoBrowser.ts";
export type { MangoBrowserSession } from "./mangoBrowser.ts";

/** Single-flight guard: concurrent KPI calls for one user share one browser login. */
const loginInFlight = new Map<string, Promise<MangoBrowserSession>>();

export type MangoStoredCredential = {
  /** Encrypted email, encrypted password, encrypted jwt_token (or null). */
  email: string;
  password: string;
  /** Encrypted cached RS256 jwt_token; null until first login. */
  authToken: string | null;
  /** Legacy column — refresh tokens are useless for KPI; kept for schema compat. */
  refreshToken: string | null;
  /** JSON-encoded number[] of Mango operator group IDs; null until first login. */
  operatorGroups: string | null;
};

async function persistSession(
  userId: string | undefined,
  session: MangoBrowserSession,
): Promise<void> {
  if (!userId) return;
  try {
    await db
      .update(mangoCredentials)
      .set({
        authToken: encryptToken(session.jwtToken),
        operatorGroups: JSON.stringify(session.operatorGroups),
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

function isAscii(s: string): boolean {
  return !s.split("").some((c) => c.charCodeAt(0) > 127);
}

type MangoFetchMode =
  | { kind: "single"; memberId?: number | null }
  | { kind: "team" };

type MangoFetchResult<M extends MangoFetchMode> = M extends { kind: "team" }
  ? MangoMemberKpi[]
  : MangoKpi;

/**
 * Two-tier session driver shared by the single-operator and team KPI flows:
 * cached RS256 jwt_token first, headless-browser re-login on rejection.
 * `mode` picks the report shape (one operator vs the full member list).
 *
 * @throws MangoAuthError           — credentials rejected; user must re-enter
 * @throws MangoKpiUnavailableError — transient / infrastructure failures
 */
async function fetchWithMangoSession<M extends MangoFetchMode>(
  credential: MangoStoredCredential,
  mode: M,
  opts?: { totalTimeoutMs?: number; userId?: string },
): Promise<MangoFetchResult<M>> {
  const started = Date.now();
  const remaining = () =>
    opts?.totalTimeoutMs ? Math.max(0, opts.totalTimeoutMs - (Date.now() - started)) : undefined;

  const run = (jwt: string, groups: number[]): Promise<MangoFetchResult<M>> =>
    mode.kind === "team"
      ? (fetchMangoTeamKpi(jwt, groups, fetch, MANGO_RESULT_POLL_DELAY_MS, remaining()) as Promise<MangoFetchResult<M>>)
      : (fetchMangoKpi(
          jwt,
          groups,
          fetch,
          MANGO_RESULT_POLL_DELAY_MS,
          remaining(),
          mode.memberId,
        ) as Promise<MangoFetchResult<M>>);

  // ── 1. Cached RS256 jwt_token + operator groups ───────────────────────────
  const cachedJwt = decryptPlain(credential.authToken);
  const cachedGroups = parseOperatorGroups(credential.operatorGroups);
  if (cachedJwt && cachedGroups.length > 0 && isAscii(cachedJwt)) {
    try {
      return await run(cachedJwt, cachedGroups);
    } catch (err) {
      if (!(err instanceof MangoTokenExpiredError)) throw err;
    }
  }

  // ── 2. Headless-browser re-login ──────────────────────────────────────────
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
  const session = await loginPromise;

  await persistSession(opts?.userId, session);
  try {
    return await run(session.jwtToken, session.operatorGroups);
  } catch (err) {
    // A freshly harvested session being rejected is an auth-class failure —
    // classify it so callers return 401 (re-login) instead of a generic 500.
    if (err instanceof MangoTokenExpiredError) {
      throw new MangoAuthError("Mango отклонил новую сессию — войдите заново");
    }
    throw err;
  }
}

/**
 * Fetch today's call count + traffic from Mango CCC for one operator
 * (defaults to the token's own member; pass opts.memberId to scope the
 * shared dashboard connection to the requesting user's claimed operator).
 */
export async function getMangoKpi(
  credential: MangoStoredCredential,
  opts?: { totalTimeoutMs?: number; userId?: string; memberId?: number | null },
): Promise<MangoKpi> {
  return fetchWithMangoSession(credential, { kind: "single", memberId: opts?.memberId }, opts);
}

/**
 * Fetch today's KPI for EVERY operator of the Mango groups (team view) from
 * the shared dashboard connection. Fails explicitly when the operator list
 * cannot be decoded — never returns an empty array silently.
 */
export async function getMangoTeamKpi(
  credential: MangoStoredCredential,
  opts?: { totalTimeoutMs?: number; userId?: string },
): Promise<MangoMemberKpi[]> {
  return fetchWithMangoSession(credential, { kind: "team" }, opts);
}
