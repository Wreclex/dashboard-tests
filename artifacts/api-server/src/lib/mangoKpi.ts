/**
 * Mango Office KPI entry point.
 *
 * Decrypts the stored auth_token and calls the KPI API.
 * On 401/403 (token expired), automatically refreshes using the stored
 * refresh_token and retries once, then updates the DB with the new tokens.
 */

import { decryptToken, encryptToken } from "./encrypt.ts";
import { mangoRefresh, MangoAuthError } from "./mangoAuth.ts";
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

/**
 * Fetch today's call count + traffic from Mango CCC.
 *
 * - Decrypts auth_token, uses it as Bearer for the KPI call.
 * - On 401/403: decrypts refresh_token, calls mangoRefresh(), updates DB,
 *   then retries KPI once with the new token.
 * - Throws MangoAuthError if refresh also fails (user must re-run bookmarklet).
 * - Throws MangoKpiUnavailableError on other errors.
 */
export async function getMangoKpi(
  encryptedAuthToken: string,
  encryptedRefreshToken: string,
  opts?: { totalTimeoutMs?: number; userId?: string },
): Promise<MangoKpi> {
  const authToken = decryptToken(encryptedAuthToken).trim();
  if (!authToken) throw new MangoKpiUnavailableError("Stored Mango auth token is empty");

  try {
    return await fetchMangoKpi(authToken, fetch, MANGO_RESULT_POLL_DELAY_MS, opts?.totalTimeoutMs);
  } catch (err) {
    if (!(err instanceof MangoTokenExpiredError)) throw err;
  }

  // Token expired — try to refresh.
  const refreshToken = decryptToken(encryptedRefreshToken).trim();
  if (!refreshToken) throw new MangoAuthError("Токен Mango истёк — обновите через закладку");

  const refreshed = await mangoRefresh(refreshToken);

  // Persist new tokens if we have the userId.
  if (opts?.userId) {
    try {
      await db
        .update(mangoCredentials)
        .set({
          authToken: encryptToken(refreshed.authToken),
          refreshToken: encryptToken(refreshed.refreshToken),
          updatedAt: new Date(),
        })
        .where(eq(mangoCredentials.userId, opts.userId));
    } catch {
      // Non-fatal — still return KPI even if DB update fails.
    }
  }

  return fetchMangoKpi(refreshed.authToken, fetch, MANGO_RESULT_POLL_DELAY_MS, opts?.totalTimeoutMs);
}
