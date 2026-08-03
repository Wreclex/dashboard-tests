/**
 * Mango Office KPI client — encrypted-token entry point.
 *
 * Pure helpers, error types, and the full async fetch protocol live in
 * mangoKpiFormat.ts so they can be imported in tests without the encrypt /
 * logger stack.  This module only adds the decryptToken wrapper.
 */

import { decryptToken } from "./encrypt.ts";
import {
  MANGO_RESULT_POLL_DELAY_MS,
  MangoKpiUnavailableError,
  fetchMangoKpi,
  type MangoKpi,
} from "./mangoKpiFormat.ts";

// Re-export everything so callers can import from one place.
export {
  MANGO_KPI_RESULT_URL,
  MANGO_KPI_URL,
  MangoKpiUnavailableError,
  MangoTokenExpiredError,
  extractReportKey,
  fetchMangoKpi,
  formatMangoTraffic,
  todayMoscow,
  type FetchFn,
} from "./mangoKpiFormat.ts";
export type { MangoKpi } from "./mangoKpiFormat.ts";

/**
 * Fetch today's call count + traffic from Mango CCC.
 *
 * Decrypts the stored AES-256-GCM token, strips any "Bearer " prefix, and
 * delegates to fetchMangoKpi.
 *
 * Throws MangoTokenExpiredError on 401/403.
 * Throws MangoKpiUnavailableError on any other error or unrecognised response.
 */
export async function getMangoKpi(
  encryptedToken: string,
  opts?: { totalTimeoutMs?: number },
): Promise<MangoKpi> {
  const raw = decryptToken(encryptedToken).replace(/^Bearer\s+/i, "").trim();
  if (!raw) throw new MangoKpiUnavailableError("Stored Mango Office token is empty after decrypt");
  return fetchMangoKpi(raw, fetch, MANGO_RESULT_POLL_DELAY_MS, opts?.totalTimeoutMs);
}
