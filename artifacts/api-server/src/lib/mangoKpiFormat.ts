/**
 * Mango Office member-KPI: pure schema helpers, constants, formatters, and
 * the testable async fetch logic.
 *
 * This module has NO I/O dependencies beyond an injectable `FetchFn` parameter
 * so it can be imported directly in tests without the encrypt / logger stack.
 *
 * Protocol verified live against production traffic, 2026-08
 * (captured from the real CCC browser session and replayed via curl):
 *
 *   Step 1 – POST https://api2.mangotele.com/v2/ccc/reports/oper-kpi2
 *             Body: application/x-www-form-urlencoded with
 *               GroupId[]=<id>          (one entry per operator group; REQUIRED —
 *                                        without it the report returns 0 rows)
 *               FromDate / UntilDate    YYYY-MM-DD
 *               FromTime / UntilTime    HH:MM:SS
 *               time_zone_iana_id=Europe/Moscow
 *               time_zone_utc_offset=180
 *               app=webcov
 *               outputType=json
 *               jwt_token=<RS256 JWT>   (the localStorage `jwt_token` — NOT the
 *                                        HS256 `auth_token`, which api2 rejects
 *                                        with "Incorrect key for this algorithm")
 *             Response: HTTP 202 { key: "<reportKey>" }
 *
 *   Step 2 – POST https://api2.mangotele.com/v2/ccc/reports/oper-kpi2/result
 *             Body: same form fields plus key=<reportKey>
 *             Response: { data: […rows], grouped: […rows] }
 *
 * NOTE: `total-time-external-calls` arrives as an "HH:MM:SS" string
 * (e.g. "02:11:07"), not as a number of seconds.
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
  constructor(message = "Mango Office token expired") {
    super(message);
  }
}

/** Mango auth result codes: 1103 token dead, 1114 expired, 0 = JWT parse error. */
const MANGO_AUTH_FAILURE_CODES = new Set([0, 401, 403, 1103, 1114]);

/**
 * Throws MangoTokenExpiredError when a 200-body carries an auth failure code.
 * Call only after KPI parsing has failed for the payload.
 */
function throwIfMangoAuthBody(payload: unknown): void {
  if (payload === null || typeof payload !== "object") return;
  const code = (payload as { code?: unknown }).code;
  if (typeof code === "number" && MANGO_AUTH_FAILURE_CODES.has(code)) {
    throw new MangoTokenExpiredError(
      `Mango отклонил токен (code ${code}): ${JSON.stringify(payload).slice(0, 200)}`,
    );
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

/**
 * Parse a traffic duration to seconds.
 * Production payloads carry `total-time-external-calls` as "HH:MM:SS"
 * (e.g. "02:11:07"); hours may exceed 24. Plain numbers / numeric strings
 * (seconds) are also accepted for resilience.
 */
export function parseTrafficToSeconds(value: unknown): number | null {
  const numeric = toFiniteNumber(value);
  if (numeric !== null) return numeric;
  if (typeof value === "string") {
    // Hours are unbounded (may exceed 24); minutes/seconds must be 0–59.
    const m = value.trim().match(/^(\d+):([0-5]?\d):([0-5]?\d)$/);
    if (m) return Number(m[1]) * 3_600 + Number(m[2]) * 60 + Number(m[3]);
  }
  return null;
}

/** Extract KPI from one row using EXACT field names from the bundle. */
function extractRow(row: MangoRow): MangoKpi | null {
  const calls = toFiniteNumber(row[FIELD_CALLS]);
  const trafficSeconds = parseTrafficToSeconds(row[FIELD_TRAFFIC]);
  if (calls === null || trafficSeconds === null) return null;
  if (calls < 0 || trafficSeconds < 0) return null;
  return { calls: Math.round(calls), trafficSeconds: Math.round(trafficSeconds) };
}

/**
 * Parse a Mango `oper-kpi2/result` response body.
 *
 * The GroupId[] report returns ONE ROW PER MEMBER of the operator groups
 * (873 rows observed live) — so when `memberId` is given, only that
 * operator's rows are summed. Without member scoping the sum would include
 * every colleague's calls and traffic (the "8 минут без звонков" bug).
 *
 * `data` and `grouped` are candidate collections: each is scoped to the
 * member FIRST, and the first collection yielding valid KPI rows wins.
 * (A nonempty `data` containing only OTHER members' rows must not hide
 * the operator's row in `grouped`.)
 *
 * Returns null when:
 * - payload is not an object / array
 * - response is the step-1 handshake body ({ key: "…" } only)
 * - neither collection contains a valid row for the requested member
 * - no row contains both required exact field names
 */
export function parseMangoOperKpi2Response(
  payload: unknown,
  memberId?: number | null,
): MangoKpi | null {
  if (!payload || typeof payload !== "object") return null;

  // Candidate row collections in preference order: data, then grouped.
  const candidates: MangoRow[][] = [];
  if (Array.isArray(payload)) {
    candidates.push(payload as MangoRow[]);
  } else {
    const p = payload as Record<string, unknown>;
    // Step-1 handshake response — result comes from the result endpoint.
    if ("key" in p && !("data" in p) && !("grouped" in p)) return null;
    if (Array.isArray(p["data"])) candidates.push(p["data"] as MangoRow[]);
    if (Array.isArray(p["grouped"])) candidates.push(p["grouped"] as MangoRow[]);
  }

  for (const candidate of candidates) {
    const scoped =
      memberId != null
        ? candidate.filter(
            (r) => r && typeof r === "object" && String(r["member_id"]) === String(memberId),
          )
        : candidate;

    let totalCalls = 0;
    let totalTraffic = 0;
    let matched = 0;
    for (const row of scoped) {
      if (!row || typeof row !== "object") continue;
      const extracted = extractRow(row as MangoRow);
      if (!extracted) continue;
      totalCalls += extracted.calls;
      totalTraffic += extracted.trafficSeconds;
      matched++;
    }
    if (matched > 0) return { calls: totalCalls, trafficSeconds: totalTraffic };
  }

  return null;
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
 * Decode the member_id embedded in the RS256 jwt_token payload
 * (`payload.data.member_id`, where `data` is a nested object OR a JSON
 * string). No signature verification — we only read our own token to scope
 * the KPI report to the current operator. Returns null for unexpected shapes.
 */
export function decodeMangoMemberId(jwtToken: string): number | null {
  try {
    const parts = jwtToken.split(".");
    if (parts.length !== 3) return null;
    const payload: unknown = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object") return null;
    let data: unknown = (payload as Record<string, unknown>)["data"];
    if (typeof data === "string") data = JSON.parse(data);
    if (!data || typeof data !== "object") return null;
    const id = (data as Record<string, unknown>)["member_id"];
    return typeof id === "number" && Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Parse operator group IDs stored as JSON (`[19431874,20165172]`) or CSV
 * (`19431874,20165172`) text. Returns only positive integers; []
 * when nothing usable is present.
 */
export function parseOperatorGroups(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (Array.isArray(v)) {
      return v.filter(
        (n): n is number => typeof n === "number" && Number.isInteger(n) && n > 0,
      );
    }
  } catch {
    // Not JSON — fall through to CSV parsing.
  }
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
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
 * Build the application/x-www-form-urlencoded body shared by both steps.
 * `GroupId[]` is REQUIRED — without it the report returns 0 rows.
 */
function buildFormBody(
  jwtToken: string,
  operatorGroups: number[],
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams();
  for (const g of operatorGroups) params.append("GroupId[]", String(g));
  const today = todayMoscow();
  params.set("FromDate", today);
  params.set("UntilDate", today);
  params.set("FromTime", "00:00:00");
  params.set("UntilTime", "23:59:59");
  params.set("time_zone_iana_id", "Europe/Moscow");
  params.set("time_zone_utc_offset", "180");
  params.set("app", "webcov");
  params.set("outputType", "json");
  params.set("jwt_token", jwtToken);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  return params.toString();
}

/**
 * Fetch today's Mango CCC KPI using the RS256 `jwt_token` harvested from the
 * CCC session's localStorage (via headless login or manual paste).
 *
 * Implements the two-step protocol verified against production traffic:
 *   1. POST oper-kpi2 (form body, GroupId[] + jwt_token) → 202 { key }
 *   2. Poll oper-kpi2/result (same body + key) until data rows arrive
 *
 * The `fetchFn` parameter is injectable for unit tests (pass `fetch` in prod).
 *
 * Throws MangoTokenExpiredError on 401 / 403 from either step.
 * Throws MangoKpiUnavailableError on network errors, unexpected shapes, or
 * when the result is not available within the polling budget.
 */
export async function fetchMangoKpi(
  rawToken: string,
  operatorGroups: number[],
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
  const groups = operatorGroups.filter((g) => Number.isFinite(g) && g > 0);
  if (groups.length === 0) {
    throw new MangoKpiUnavailableError("Mango operator groups are not configured");
  }

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

  // Mango api2 authenticates via the RS256 `jwt_token` carried INSIDE the
  // form body (verified against captured production traffic, 2026-08).
  // Bearer headers are ignored, and the HS256 `auth_token` is rejected
  // outright ("Incorrect key for this algorithm").
  const apiHeaders = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
    Origin: "https://ccc.mango-office.ru",
    Referer: "https://ccc.mango-office.ru/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  };

  const handshakeBody = buildFormBody(trimmed, groups);

  // Scope the report to the current operator: the GroupId[] report returns
  // one row per member of the groups — summing all rows would add colleagues'
  // calls/traffic (verified live: 873 rows, user's own row was zero while
  // the unfiltered sum was 8+ minutes of colleagues' outbound calls).
  // Fail CLOSED when the member id cannot be decoded: an undecodable token
  // is broken, not a license to aggregate every group member.
  const memberId = decodeMangoMemberId(trimmed);
  if (memberId === null) {
    throw new MangoKpiUnavailableError(
      "Mango jwt_token does not contain a decodable member_id — re-connect Mango Office",
    );
  }

  // ── Step 1: POST to oper-kpi2 ─────────────────────────────────────────────
  let hsRes: Response;
  try {
    hsRes = await fetchFn(MANGO_KPI_URL, {
      method: "POST",
      headers: apiHeaders,
      body: handshakeBody,
      signal: makeSignal(),
    });
  } catch (err) {
    throw new MangoKpiUnavailableError(
      `Mango handshake failed: ${err instanceof Error ? err.message : "network error"}`,
    );
  }

  if (hsRes.status === 401 || hsRes.status === 403) {
    // Capture Mango's error body — it explains WHY the token was rejected
    // (e.g. wrong audience, expired, malformed) which is critical for debugging.
    let detail = "";
    try {
      detail = (await hsRes.text()).slice(0, 500);
    } catch { /* body unavailable */ }
    console.warn(`[mango] KPI handshake rejected: HTTP ${hsRes.status} body=${detail || "<empty>"}`);
    throw new MangoTokenExpiredError(
      `Mango отклонил токен (HTTP ${hsRes.status})${detail ? `: ${detail}` : ""}`,
    );
  }
  if (!hsRes.ok)
    throw new MangoKpiUnavailableError(`Mango handshake returned HTTP ${hsRes.status}`);

  let hsPayload: unknown;
  try {
    hsPayload = await hsRes.json();
  } catch {
    throw new MangoKpiUnavailableError("Mango handshake returned non-JSON body");
  }

  // Optimistic path: a direct/synchronous Mango deployment may include data.
  const direct = parseMangoOperKpi2Response(hsPayload, memberId);
  if (direct) return direct;

  const key = extractReportKey(hsPayload);
  if (!key) {
    // No usable data — check whether Mango encoded an auth failure in the body
    // (HTTP 200 + {"code":403,...}, or {"code":0,"Wrong number of segments"}
    // for a malformed JWT). Only classify AFTER KPI parsing failed so a valid
    // payload that happens to carry a top-level `code` isn't misread.
    throwIfMangoAuthBody(hsPayload);
    throw new MangoKpiUnavailableError(
      "Mango handshake contained no report key and no KPI data",
    );
  }

  // ── Step 2: Poll oper-kpi2/result until the report is ready ───────────────
  const resultBody = buildFormBody(trimmed, groups, { key });

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
        headers: apiHeaders,
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

    const kpi = parseMangoOperKpi2Response(resPayload, memberId);
    if (kpi) return kpi;
    // Auth failure encoded in a 200 body — bail to the refresh/re-login tier
    // instead of polling until the generic "not available" error.
    throwIfMangoAuthBody(resPayload);
    // Not ready yet — poll again.
  }

  throw new MangoKpiUnavailableError(
    `Mango report result not available after ${MANGO_RESULT_POLL_ATTEMPTS} attempts`,
  );
}
