/**
 * Mango Office KPI entry point — decrypts stored credentials, signs in
 * automatically, then fetches today's KPI.
 */

import { decryptToken } from "./encrypt.ts";
import { mangoSignIn, MangoAuthError } from "./mangoAuth.ts";
import {
  MANGO_RESULT_POLL_DELAY_MS,
  MangoKpiUnavailableError,
  fetchMangoKpi,
  type MangoKpi,
} from "./mangoKpiFormat.ts";

export {
  MANGO_KPI_RESULT_URL,
  MANGO_KPI_URL,
  MangoKpiUnavailableError,
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
 * Decrypts stored email + password, signs in automatically to obtain a fresh
 * Bearer token, then delegates to fetchMangoKpi.
 *
 * Throws MangoAuthError on bad credentials.
 * Throws MangoKpiUnavailableError on any other error or unrecognised response.
 */
export async function getMangoKpi(
  encryptedEmail: string,
  encryptedPassword: string,
  opts?: { totalTimeoutMs?: number },
): Promise<MangoKpi> {
  const email = decryptToken(encryptedEmail).trim();
  const password = decryptToken(encryptedPassword).trim();

  if (!email || !password) {
    throw new MangoKpiUnavailableError("Stored Mango credentials are empty after decrypt");
  }

  const token = await mangoSignIn(email, password);

  return fetchMangoKpi(token, fetch, MANGO_RESULT_POLL_DELAY_MS, opts?.totalTimeoutMs);
}
