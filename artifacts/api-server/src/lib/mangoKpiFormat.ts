/**
 * Mango Office member-KPI: pure schema helpers, constants, formatters, and
 * the testable async fetch logic.
 *
 * This module has NO I/O dependencies beyond an injectable `FetchFn` parameter
 * so it can be imported directly in tests without the encrypt / logger stack.
 *
 * Protocol discovered from the Mango CCC dashboard bundle, 2026-08
 * (chunk-D5CTCMDK.js / chunk-BWYX5NMI.js):
 *
 *   Step 1 – POST https://api2.mangotele.com/v2/ccc/reports/oper-kpi2
 *             Body: { date_from, date_until, time_from, time_until, Fields, … }
 *             Response: { key: "<reportKey>" }
 *
 *   Step 2 – POST https://api2.mangotele.com/v2/ccc/reports/oper-kpi2/result
 *             Body: { key: "<reportKey>" }
 *             Response: { data: […rows], grouped: […rows] }
 *
 * The Mango dashboard uses a socket.io WebSocket (ccc.mango-office.ru:1443) to
 * be notified when the result is ready, then executes step 2.  Our server-side
 * client skips the WebSocket by polling the result endpoint with bounded retry
 * (MANGO_RESULT_POLL_ATTEMPTS × MANGO_RESULT_POLL_DELAY_MS).
 *
 * Each row in data/grouped uses kebab-case field names from the dashboard's
 * fieldsDB map.  We accept ONLY the two exact field names so an unexpected
 * shape fails closed rather than silently returning the wrong metric.
 */

// ─── Endpoint constants ───────────────────────────────────────────────────────

/** Mango CCC REST API v2 base URL (apiCov.url in the production bundle). */
export const MANGO_API_BASE = "https://api2.mangotele.com/v2/";

/** KPI report request path. */
export const MANGO_KPI_PATH = "ccc/reports/oper-kpi2";

/** KPI report result path (polled after the step-1 handshake). */
export const MANGO_KPI_RESULT_PATH = "ccc/reports/oper-kpi2/result";

export const MANGO_KPI_URL = MANGO_API_BASE + MANGO_KPI_PATH;
export const MANGO_KPI_RESULT_URL = MANGO_API_BASE + MANGO_KPI_RESULT_PATH;

export const MANGO_TIMEOUT_MS = 30_000;

/** Polling: how many times to POST to the result endpoint before giving up. */
export const MANGO_RESULT_POLL_ATTEMPTS = 6;

/** Polling: delay in ms between result-endpoint attempts. */
export const MANGO_RESULT_POLL_DELAY_MS = 3_000;

/**
 * Fields requested from Mango (subset of fieldsDB).
 * `date` is required for row scoping; the other two carry the target metrics.
 */
export const REQUEST_FIELDS = [
  "date",
  "count-received-calls",
  "total-time-external-calls",
] as const;

/** Exact field names as defined in the Mango dashboard bundle's fieldsDB map. */
export const FIELD_CALLS = "count-received-calls";
export const FIELD_TRAFFIC = "total-time-external-calls";

// ─── Error types ──────────────────────────────────────────────────────────────

export class MangoTokenExpiredError extends Error {
  constructor() {
    super("Mango Office token expired");
  }
}

export class MangoKpiUnavailableError extends Error {
  constructor(message = "Mango Office did not return recognizable KPI data") {
    super(message);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type MangoKpi = { calls: number; trafficSeconds: number };

/** Injectable fetch function — allows unit tests to mock HTTP. */
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

type MangoRow = Record<string, unknown>;

// ─── Pure schema helpers ──────────────────────────────────────────────────────

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Extract KPI from one row using EXACT field names from the bundle. */
function extractRow(row: MangoRow): MangoKpi | null {
  const calls = toFiniteNumber(row[FIELD_CALLS]);
  const trafficSeconds = toFiniteNumber(row[FIELD_TRAFFIC]);
  if (calls === null || trafficSeconds === null) return null;
  if (calls < 0 || trafficSeconds < 0) return null;
  return { calls: Math.round(calls), trafficSeconds: Math.round(trafficSeconds) };
}

/**
 * Parse a Mango `oper-kpi2/result` response body.
 *
 * Sums KPI across all rows in `data` (one per date when querying today).
 * Falls back to `grouped` if `data` is absent.
 * Returns null when:
 * - payload is not an object / array
 * - response is the step-1 handshake body ({ key: "…" } only)
 * - no row contains both required exact field names
 */
export function parseMangoOperKpi2Response(payload: unknown): MangoKpi | null {
  if (!payload || typeof payload !== "object") return null;

  const rows: MangoRow[] = [];
  if (Array.isArray(payload)) {
    rows.push(...(payload as MangoRow[]));
  } else {
    const p = payload as Record<string, unknown>;
    // Step-1 handshake response — result comes from the result endpoint.
    if ("key" in p && !("data" in p) && !("grouped" in p)) return null;
    if (Array.isArray(p["data"])) rows.push(...(p["data"] as MangoRow[]));
    if (rows.length === 0 && Array.isArray(p["grouped"])) {
      rows.push(...(p["grouped"] as MangoRow[]));
    }
  }

  if (rows.length === 0) return null;

  let totalCalls = 0;
  let totalTraffic = 0;
  let matched = 0;

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const extracted = extractRow(row as MangoRow);
    if (!extracted) continue;
    totalCalls += extracted.calls;
    totalTraffic += extracted.trafficSeconds;
    matched++;
  }

  return matched === 0 ? null : { calls: totalCalls, trafficSeconds: totalTraffic };
}

/** Alias for backwards-compat. */
export const parseMangoKpiPayload = parseMangoOperKpi2Response;

/**
 * Extract the report key from a step-1 handshake response.
 * Returns null when the key field is absent, empty, or not a string.
 */
export function extractReportKey(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const key = (payload as Record<string, unknown>)["key"];
  return typeof key === "string" && key.trim().length > 0 ? key.trim() : null;
}

/**
 * Return today's date as YYYY-MM-DD in Moscow local time (UTC+3).
 * Mango CCC always operates on Moscow time regardless of server location.
 */
export function todayMoscow(now = Date.now()): string {
  const d = new Date(now + 3 * 60 * 60 * 1_000);
  return d.toISOString().slice(0, 10);
}

/**
 * Format a duration in seconds as HH:MM:SS without wrapping at 24 h.
 * (Date.prototype.toISOString wraps at 24 h — this implementation does not.)
 */
export function formatMangoTraffic(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  const r = s % 60;
  return [h, m, r].map((p) => String(p).padStart(2, "0")).join(":");
}

// ─── Two-step async KPI fetch (no crypto dependency) ─────────────────────────

/**
 * Fetch today's Mango CCC KPI using a raw (already-decrypted) Bearer token.
 *
 * Implements the two-step protocol observed in the dashboard bundle:
 *   1. POST oper-kpi2 → receive { key }
 *   2. Poll oper-kpi2/result with { key } until data rows arrive
 *
 * The `fetchFn` parameter is injectable for unit tests (pass `fetch` in prod).
 *
 * Throws MangoTokenExpiredError on 401 / 403 from either step.
 * Throws MangoKpiUnavailableError on network errors, unexpected shapes, or
 * when the result is not available within the polling budget.
 */
export async function fetchMangoKpi(
  rawToken: string,
  fetchFn: FetchFn = fetch,
  pollDelayMs = MANGO_RESULT_POLL_DELAY_MS,
  /**
   * Hard wall-clock cap (ms) for the *entire* operation (handshake + all polls
   * combined).  Each individual fetch gets `min(MANGO_TIMEOUT_MS, remaining)`
   * as its AbortSignal, so even a single stalling request cannot push the
   * operation past this budget.  When omitted no operation-wide cap applies.
   */
  totalTimeoutMs?: number,
): Promise<MangoKpi> {
  const trimmed = rawToken.trim();
  if (!trimmed) throw new MangoKpiUnavailableError("Mango Office token is empty");

  // Deadline: absolute epoch ms, or +Infinity when no cap requested.
  const deadline =
    totalTimeoutMs !== undefined ? Date.now() + totalTimeoutMs : Number.POSITIVE_INFINITY;

  /**
   * Build an AbortSignal for a single fetch whose per-request limit is
   * MANGO_TIMEOUT_MS but is further constrained to not exceed the remaining
   * wall-clock budget.  If the budget is already exhausted the signal is
   * pre-aborted so the fetch throws immediately.
   */
  function makeSignal(): AbortSignal {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      // Budget already consumed — return a pre-aborted signal.
      const c = new AbortController();
      c.abort(new MangoKpiUnavailableError(`Mango KPI exceeded wall-clock budget (${totalTimeoutMs} ms)`));
      return c.signal;
    }
    const effectiveMs = Math.min(MANGO_TIMEOUT_MS, remaining);
    return AbortSignal.timeout(effectiveMs);
  }

  const auth = `Bearer ${trimmed}`;
  const today = todayMoscow();

  const handshakeBody = JSON.stringify({
    date_from: today,
    date_until: today,
    time_from: "00:00:00",
    time_until: "23:59:59",
    time_zone_iana_id: "Europe/Moscow",
    time_zone_utc_offset: 180,
    records_num: 1000,
    offset: 0,
    Language: "ru_RU",
    personal: true,
    return: "grouped",
    outputType: "json",
    app: "report-tool",
    Fields: REQUEST_FIELDS,
  });

  // ── Step 1: POST to oper-kpi2 ─────────────────────────────────────────────
  let hsRes: Response;
  try {
    hsRes = await fetchFn(MANGO_KPI_URL, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
      body: handshakeBody,
      signal: makeSignal(),
    });
  } catch (err) {
    throw new MangoKpiUnavailableError(
      `Mango handshake failed: ${err instanceof Error ? err.message : "network error"}`,
    );
  }

  if (hsRes.status === 401 || hsRes.status === 403) throw new MangoTokenExpiredError();
  if (!hsRes.ok)
    throw new MangoKpiUnavailableError(`Mango handshake returned HTTP ${hsRes.status}`);

  let hsPayload: unknown;
  try {
    hsPayload = await hsRes.json();
  } catch {
    throw new MangoKpiUnavailableError("Mango handshake returned non-JSON body");
  }

  // Optimistic path: a direct/synchronous Mango deployment may include data.
  const direct = parseMangoOperKpi2Response(hsPayload);
  if (direct) return direct;

  const key = extractReportKey(hsPayload);
  if (!key) {
    throw new MangoKpiUnavailableError(
      "Mango handshake contained no report key and no KPI data",
    );
  }

  // ── Step 2: Poll oper-kpi2/result until the report is ready ───────────────
  const resultBody = JSON.stringify({ key });
  const resultHeaders = {
    Authorization: auth,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  for (let attempt = 1; attempt <= MANGO_RESULT_POLL_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      const remainingBeforeSleep = deadline - Date.now();
      if (remainingBeforeSleep <= 0) {
        throw new MangoKpiUnavailableError(
          `Mango KPI exceeded wall-clock budget (${totalTimeoutMs} ms)`,
        );
      }
      // Cap the sleep to the remaining budget so we don't overshoot the deadline.
      const sleepMs = Math.min(pollDelayMs, remainingBeforeSleep);
      await new Promise<void>((resolve) => setTimeout(resolve, sleepMs));
    }

    let resRes: Response;
    try {
      // makeSignal() re-evaluates remaining budget immediately before this fetch.
      resRes = await fetchFn(MANGO_KPI_RESULT_URL, {
        method: "POST",
        headers: resultHeaders,
        body: resultBody,
        signal: makeSignal(),
      });
    } catch (err) {
      // Treat budget-exceeded errors as terminal — don't keep retrying.
      const isBudgetExceeded =
        err instanceof MangoKpiUnavailableError ||
        (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError"));
      if (isBudgetExceeded) {
        throw new MangoKpiUnavailableError(
          `Mango KPI exceeded wall-clock budget (${totalTimeoutMs} ms)`,
        );
      }
      if (attempt === MANGO_RESULT_POLL_ATTEMPTS) {
        throw new MangoKpiUnavailableError(
          `Mango result fetch failed: ${err instanceof Error ? err.message : "network error"}`,
        );
      }
      continue;
    }

    if (resRes.status === 401 || resRes.status === 403) throw new MangoTokenExpiredError();
    if (!resRes.ok) {
      if (attempt === MANGO_RESULT_POLL_ATTEMPTS)
        throw new MangoKpiUnavailableError(`Mango result returned HTTP ${resRes.status}`);
      continue;
    }

    let resPayload: unknown;
    try {
      resPayload = await resRes.json();
    } catch {
      if (attempt === MANGO_RESULT_POLL_ATTEMPTS)
        throw new MangoKpiUnavailableError("Mango result returned non-JSON body");
      continue;
    }

    const kpi = parseMangoOperKpi2Response(resPayload);
    if (kpi) return kpi;
    // Not ready yet — poll again.
  }

  throw new MangoKpiUnavailableError(
    `Mango report result not available after ${MANGO_RESULT_POLL_ATTEMPTS} attempts`,
  );
}
