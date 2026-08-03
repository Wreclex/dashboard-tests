/**
 * Tests for Mango Office KPI client.
 *
 * All imports come from mangoKpiFormat.ts, which has no I/O or encryption
 * dependencies.  The full two-step fetch protocol is implemented in
 * fetchMangoKpi (also in that module) with an injectable FetchFn, so tests
 * can mock HTTP without a real token or BOT_TOKEN_ENCRYPTION_KEY.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  MANGO_KPI_RESULT_URL,
  MANGO_KPI_URL,
  MANGO_RESULT_POLL_ATTEMPTS,
  MangoKpiUnavailableError,
  MangoTokenExpiredError,
  extractReportKey,
  fetchMangoKpi,
  formatMangoTraffic,
  parseMangoOperKpi2Response as parse,
  todayMoscow,
  type FetchFn,
} from "./mangoKpiFormat.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Build a FetchFn that returns an ordered sequence of responses. */
function sequentialFetch(responses: Response[]): FetchFn {
  let i = 0;
  return async () => {
    if (i >= responses.length) throw new Error(`sequentialFetch: call ${i} has no response`);
    return responses[i++]!;
  };
}

/** Build a FetchFn that records each (url, body) call and returns responses. */
function recordingFetch(
  responses: Response[],
  calls: Array<{ url: string; body: unknown }>,
): FetchFn {
  let i = 0;
  return async (url, init) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body as string) : null });
    if (i >= responses.length) throw new Error(`recordingFetch: call ${i} has no response`);
    return responses[i++]!;
  };
}

// ─── Schema parser — pure, no fetch ──────────────────────────────────────────

test("parse: valid result-endpoint response with exact field names", () => {
  const payload = {
    data: [{ date: "2026-08-03", "count-received-calls": 42, "total-time-external-calls": 3600 }],
    grouped: [],
  };
  assert.deepEqual(parse(payload), { calls: 42, trafficSeconds: 3600 });
});

test("parse: sums multiple data rows", () => {
  const payload = {
    data: [
      { date: "2026-08-03", "count-received-calls": 10, "total-time-external-calls": 600 },
      { date: "2026-08-03", "count-received-calls": 5, "total-time-external-calls": 300 },
    ],
  };
  assert.deepEqual(parse(payload), { calls: 15, trafficSeconds: 900 });
});

test("parse: falls back to grouped when data is absent", () => {
  const payload = {
    grouped: [{ member_id: 1, "count-received-calls": 8, "total-time-external-calls": 480 }],
  };
  assert.deepEqual(parse(payload), { calls: 8, trafficSeconds: 480 });
});

test("parse: accepts string-encoded numeric values", () => {
  const payload = {
    data: [{ date: "2026-08-03", "count-received-calls": "7", "total-time-external-calls": "300" }],
  };
  assert.deepEqual(parse(payload), { calls: 7, trafficSeconds: 300 });
});

test("parse: rejects step-1 handshake body (key-only response)", () => {
  assert.equal(parse({ key: "abc123" }), null);
});

test("parse: rejects heuristic / loosely-named fields — strict schema only", () => {
  // Old broad parser accepted 'calls', 'duration', etc. The strict one must not.
  assert.equal(parse({ data: [{ calls: 5, duration: 100 }] }), null);
  assert.equal(parse({ data: [{ calls_count: "8", total_duration: "120" }] }), null);
  assert.equal(parse({ data: [{ attempts: 3, traffic_seconds: 180 }] }), null);
});

test("parse: rejects rows missing count-received-calls", () => {
  assert.equal(
    parse({ data: [{ date: "2026-08-03", "total-time-external-calls": 900 }] }),
    null,
  );
});

test("parse: rejects rows missing total-time-external-calls", () => {
  assert.equal(
    parse({ data: [{ date: "2026-08-03", "count-received-calls": 5 }] }),
    null,
  );
});

test("parse: rejects null, primitives, and empty arrays", () => {
  assert.equal(parse(null), null);
  assert.equal(parse(undefined), null);
  assert.equal(parse(42), null);
  assert.equal(parse([]), null);
  assert.equal(parse({ data: [] }), null);
});

test("parse: ignores rows missing required fields; only counts valid rows", () => {
  const payload = {
    data: [
      { date: "2026-08-03", "count-received-calls": 10, "total-time-external-calls": 600 },
      { date: "2026-08-03", "count-received-calls": 5 }, // skip
      { date: "2026-08-03", unrelated: "noise" },        // skip
    ],
  };
  assert.deepEqual(parse(payload), { calls: 10, trafficSeconds: 600 });
});

// ─── extractReportKey ─────────────────────────────────────────────────────────

test("extractReportKey: returns key string from handshake response", () => {
  assert.equal(extractReportKey({ key: "rep-abc-123" }), "rep-abc-123");
  assert.equal(extractReportKey({ key: "  trimmed  " }), "trimmed");
});

test("extractReportKey: returns null for missing, empty, or non-string keys", () => {
  assert.equal(extractReportKey({}), null);
  assert.equal(extractReportKey({ key: "" }), null);
  assert.equal(extractReportKey({ key: "   " }), null);
  assert.equal(extractReportKey({ key: 42 }), null);
  assert.equal(extractReportKey(null), null);
  assert.equal(extractReportKey("not-object"), null);
  assert.equal(extractReportKey([]), null);
});

// ─── todayMoscow ─────────────────────────────────────────────────────────────

test("todayMoscow: returns YYYY-MM-DD in Moscow time (UTC+3)", () => {
  // UTC 22:30 on Aug 3 → Moscow 01:30 on Aug 4
  assert.equal(todayMoscow(Date.UTC(2026, 7, 3, 22, 30, 0)), "2026-08-04");
  // UTC 20:00 on Aug 3 → Moscow 23:00 on Aug 3
  assert.equal(todayMoscow(Date.UTC(2026, 7, 3, 20, 0, 0)), "2026-08-03");
  // UTC midnight → Moscow 03:00 same day
  assert.equal(todayMoscow(Date.UTC(2026, 7, 3, 0, 0, 0)), "2026-08-03");
});

// ─── Endpoint URL constants ───────────────────────────────────────────────────

test("MANGO_KPI_URL targets the v2 API host with the correct report path", () => {
  assert.ok(
    MANGO_KPI_URL.startsWith("https://api2.mangotele.com/v2/"),
    `Expected https://api2.mangotele.com/v2/ base, got: ${MANGO_KPI_URL}`,
  );
  assert.ok(
    MANGO_KPI_URL.endsWith("ccc/reports/oper-kpi2"),
    `Expected to end with ccc/reports/oper-kpi2, got: ${MANGO_KPI_URL}`,
  );
});

test("MANGO_KPI_RESULT_URL is MANGO_KPI_URL + /result", () => {
  assert.equal(MANGO_KPI_RESULT_URL, MANGO_KPI_URL + "/result");
});

// ─── fetchMangoKpi — two-step protocol ───────────────────────────────────────

test("fetchMangoKpi: optimistic path — data in handshake response", async () => {
  const stub = sequentialFetch([
    jsonResponse({
      key: "k1",
      data: [{ date: "2026-08-03", "count-received-calls": 20, "total-time-external-calls": 1200 }],
    }),
  ]);
  assert.deepEqual(await fetchMangoKpi("test-token", stub, 0), { calls: 20, trafficSeconds: 1200 });
});

test("fetchMangoKpi: two-step protocol — POST handshake then POST result", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const stub = recordingFetch(
    [
      jsonResponse({ key: "report-key-xyz" }), // step 1
      jsonResponse({
        data: [{ date: "2026-08-03", "count-received-calls": 55, "total-time-external-calls": 3300 }],
      }),                                        // step 2
    ],
    calls,
  );

  const result = await fetchMangoKpi("my-token", stub, 0);

  assert.deepEqual(result, { calls: 55, trafficSeconds: 3300 });
  assert.equal(calls.length, 2);
  // Step 1: handshake to oper-kpi2 — authenticated via jwt_token query param
  const url0 = new URL(calls[0]!.url);
  assert.equal(url0.origin + url0.pathname, MANGO_KPI_URL);
  assert.equal(url0.searchParams.get("jwt_token"), "my-token");
  assert.equal(url0.searchParams.get("app"), "webcov");
  const hsBody = calls[0]!.body as Record<string, unknown>;
  assert.ok(hsBody["date_from"], "handshake must include date_from");
  assert.ok(hsBody["date_until"], "handshake must include date_until");
  assert.deepEqual(hsBody["Fields"], ["date", "count-received-calls", "total-time-external-calls"]);
  assert.equal(hsBody["time_from"], "00:00:00");
  assert.equal(hsBody["time_until"], "23:59:59");
  assert.equal(hsBody["time_zone_iana_id"], "Europe/Moscow");
  // Step 2: result endpoint with the report key, also jwt_token-authenticated
  const url1 = new URL(calls[1]!.url);
  assert.equal(url1.origin + url1.pathname, MANGO_KPI_RESULT_URL);
  assert.equal(url1.searchParams.get("jwt_token"), "my-token");
  assert.equal(url1.searchParams.get("app"), "webcov");
  assert.equal((calls[1]!.body as Record<string, unknown>)["key"], "report-key-xyz");
});

test("fetchMangoKpi: date_from and date_until are equal (today only)", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const stub = recordingFetch(
    [
      jsonResponse({ key: "k" }),
      jsonResponse({
        data: [{ date: "2026-08-03", "count-received-calls": 1, "total-time-external-calls": 60 }],
      }),
    ],
    calls,
  );
  await fetchMangoKpi("tok", stub, 0);
  const b = calls[0]!.body as Record<string, unknown>;
  assert.equal(b["date_from"], b["date_until"], "date_from must equal date_until");
  assert.match(String(b["date_from"]), /^\d{4}-\d{2}-\d{2}$/);
});

test("fetchMangoKpi: retries result endpoint when not ready (empty response)", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const stub = recordingFetch(
    [
      jsonResponse({ key: "k2" }),       // handshake
      jsonResponse({ data: [] }),         // poll 1: not ready
      jsonResponse({
        data: [{ date: "2026-08-03", "count-received-calls": 3, "total-time-external-calls": 180 }],
      }),                                  // poll 2: ready
    ],
    calls,
  );
  const result = await fetchMangoKpi("tok", stub, 0);
  assert.deepEqual(result, { calls: 3, trafficSeconds: 180 });
  assert.equal(calls.length, 3); // 1 handshake + 2 result polls
});

test("fetchMangoKpi: 401 on handshake → MangoTokenExpiredError", async () => {
  const stub = sequentialFetch([jsonResponse({}, 401)]);
  await assert.rejects(() => fetchMangoKpi("tok", stub, 0), MangoTokenExpiredError);
});

test("fetchMangoKpi: 403 on handshake → MangoTokenExpiredError", async () => {
  const stub = sequentialFetch([jsonResponse({}, 403)]);
  await assert.rejects(() => fetchMangoKpi("tok", stub, 0), MangoTokenExpiredError);
});

test("fetchMangoKpi: 401 on result endpoint → MangoTokenExpiredError", async () => {
  const stub = sequentialFetch([
    jsonResponse({ key: "k" }),
    jsonResponse({}, 401),
  ]);
  await assert.rejects(() => fetchMangoKpi("tok", stub, 0), MangoTokenExpiredError);
});

test("fetchMangoKpi: 403 on result endpoint → MangoTokenExpiredError", async () => {
  const stub = sequentialFetch([
    jsonResponse({ key: "k" }),
    jsonResponse({}, 403),
  ]);
  await assert.rejects(() => fetchMangoKpi("tok", stub, 0), MangoTokenExpiredError);
});

test("fetchMangoKpi: 500 on handshake → MangoKpiUnavailableError", async () => {
  const stub = sequentialFetch([jsonResponse({ error: "server error" }, 500)]);
  await assert.rejects(() => fetchMangoKpi("tok", stub, 0), MangoKpiUnavailableError);
});

test("fetchMangoKpi: handshake returns no key and no data → MangoKpiUnavailableError", async () => {
  const stub = sequentialFetch([jsonResponse({ unrelated: "stuff" })]);
  await assert.rejects(() => fetchMangoKpi("tok", stub, 0), MangoKpiUnavailableError);
});

test("fetchMangoKpi: exhausts all result polls → MangoKpiUnavailableError", async () => {
  const responses: Response[] = [
    jsonResponse({ key: "k3" }), // handshake
    ...Array.from({ length: MANGO_RESULT_POLL_ATTEMPTS }, () => jsonResponse({ data: [] })),
  ];
  const stub = sequentialFetch(responses);
  await assert.rejects(() => fetchMangoKpi("tok", stub, 0), MangoKpiUnavailableError);
});

test("fetchMangoKpi: result arrives on the final allowed poll attempt", async () => {
  // 5 empty polls followed by a successful 6th
  const emptyPolls = Array.from(
    { length: MANGO_RESULT_POLL_ATTEMPTS - 1 },
    () => jsonResponse({ data: [] }),
  );
  const stub = sequentialFetch([
    jsonResponse({ key: "kFinal" }),                      // handshake
    ...emptyPolls,                                         // polls 1..5: not ready
    jsonResponse({                                         // poll 6: ready
      data: [{ date: "2026-08-03", "count-received-calls": 7, "total-time-external-calls": 420 }],
    }),
  ]);
  const result = await fetchMangoKpi("tok", stub, 0);
  assert.deepEqual(result, { calls: 7, trafficSeconds: 420 });
});

test("fetchMangoKpi: totalTimeoutMs=0 → MangoKpiUnavailableError (pre-aborted signal on handshake)", async () => {
  // Budget=0 means deadline = Date.now(); makeSignal() returns a pre-aborted signal.
  // The stalling handshake should detect it and throw immediately.
  let calls = 0;
  const stub: FetchFn = async (_url, init) => {
    calls++;
    const signal = (init as RequestInit & { signal?: AbortSignal }).signal;
    // Pre-aborted signal check — simulates real fetch behaviour.
    if (signal?.aborted) {
      const err = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
      throw err;
    }
    return jsonResponse({ key: "should-not-reach" });
  };
  await assert.rejects(() => fetchMangoKpi("tok", stub, 0, 0), MangoKpiUnavailableError);
  assert.equal(calls, 1, "only the handshake call should be attempted with a pre-aborted signal");
});

// ─── Stalling-fetch helpers ────────────────────────────────────────────────────

/**
 * Build a FetchFn that stalls for `delayMs` on every call and respects the
 * AbortSignal.  Aborts with AbortError when the signal fires or is pre-aborted.
 */
function stallingFetch(delayMs: number): FetchFn {
  return async (_url, init) => {
    const signal = (init as RequestInit & { signal?: AbortSignal }).signal;
    return new Promise<Response>((resolve, reject) => {
      // If the signal is already aborted when we start, fail immediately.
      if (signal?.aborted) {
        const err = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
        return reject(err);
      }
      const timer = setTimeout(() => {
        resolve(new Response(JSON.stringify({ key: "stall-resolved" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }));
      }, delayMs);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        const err = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
        reject(err);
      });
    });
  };
}

test("fetchMangoKpi: stalling handshake is aborted within totalTimeoutMs budget", async () => {
  // Handshake stalls for 1 hour; budget is 50 ms.  The handshake fetch should be
  // aborted by its time-limited AbortSignal before the budget elapses.
  const stub = stallingFetch(3_600_000);
  const start = Date.now();
  await assert.rejects(() => fetchMangoKpi("tok", stub, 0, 50), MangoKpiUnavailableError);
  // Must complete well inside the per-request limit — only limited by the budget.
  assert.ok(Date.now() - start < 5_000, "stalling handshake should be aborted within budget");
});

test("fetchMangoKpi: deadline exhausted during poll-sleep — rejects within budget, not after delay", async () => {
  // Budget = 50 ms.  Handshake + first result poll complete quickly (not-ready response).
  // The poll delay is 3 000 ms, but the remaining budget (~50 ms) must cap the sleep.
  // Total wall-clock must be well under 3 000 ms.
  let call = 0;
  const stub: FetchFn = async () => {
    call++;
    if (call === 1) return jsonResponse({ key: "k-sleep-test" }); // handshake
    return jsonResponse({ data: [] }); // result: not ready
  };
  const start = Date.now();
  await assert.rejects(() => fetchMangoKpi("tok", stub, 3_000, 50), MangoKpiUnavailableError);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 1_000, `expected completion in < 1 000 ms (got ${elapsed} ms); poll sleep was not capped`);
});

test("fetchMangoKpi: stalling result request is aborted within totalTimeoutMs budget", async () => {
  // Handshake returns key quickly; result request stalls.  Budget = 200 ms should
  // abort the stalling result request long before MANGO_TIMEOUT_MS (30 s).
  let call = 0;
  const stub: FetchFn = async (url, init) => {
    call++;
    if (call === 1) {
      // Handshake: return key immediately.
      return jsonResponse({ key: "k-stall" });
    }
    // Result: stall for 1 hour — budget AbortSignal should cut this short.
    return stallingFetch(3_600_000)(url, init);
  };
  const start = Date.now();
  await assert.rejects(() => fetchMangoKpi("tok", stub, 0, 200), MangoKpiUnavailableError);
  assert.ok(Date.now() - start < 5_000, "stalling result request should be aborted within budget");
  assert.ok(call >= 2, "at least the handshake and one result request should be attempted");
});

test("fetchMangoKpi: network error on handshake → MangoKpiUnavailableError", async () => {
  const stub: FetchFn = async () => { throw new Error("network timeout"); };
  await assert.rejects(() => fetchMangoKpi("tok", stub, 0), MangoKpiUnavailableError);
});

test("fetchMangoKpi: empty token → MangoKpiUnavailableError (no fetch calls)", async () => {
  const stub: FetchFn = async () => { throw new Error("should not be called"); };
  await assert.rejects(() => fetchMangoKpi("", stub, 0), MangoKpiUnavailableError);
  await assert.rejects(() => fetchMangoKpi("   ", stub, 0), MangoKpiUnavailableError);
});

// ─── Traffic formatter ────────────────────────────────────────────────────────

test("formatMangoTraffic: standard sub-24 h cases", () => {
  assert.equal(formatMangoTraffic(0), "00:00:00");
  assert.equal(formatMangoTraffic(59), "00:00:59");
  assert.equal(formatMangoTraffic(3_600), "01:00:00");
  assert.equal(formatMangoTraffic(3_661), "01:01:01");
});

test("formatMangoTraffic: durations >= 24 h do not wrap", () => {
  assert.equal(formatMangoTraffic(86_400), "24:00:00");
  assert.equal(formatMangoTraffic(90_000), "25:00:00");
  // Regression: Date.toISOString wraps at 24 h, returning "01:00:00" for 90 000 s.
  assert.notEqual(formatMangoTraffic(90_000), "01:00:00");
});

test("formatMangoTraffic: negative and fractional inputs are safe", () => {
  assert.equal(formatMangoTraffic(-1), "00:00:00");
  assert.equal(formatMangoTraffic(1.7), "00:00:02");
  assert.equal(formatMangoTraffic(1.2), "00:00:01");
});

// ─── Error types ──────────────────────────────────────────────────────────────

test("MangoTokenExpiredError is an Error subclass with expected message", () => {
  const e = new MangoTokenExpiredError();
  assert.ok(e instanceof Error);
  assert.ok(e instanceof MangoTokenExpiredError);
  assert.match(e.message, /expired/i);
});

test("MangoKpiUnavailableError supports default and custom messages", () => {
  const def = new MangoKpiUnavailableError();
  assert.ok(def instanceof Error);
  assert.ok(def.message.length > 0);
  assert.equal(new MangoKpiUnavailableError("custom").message, "custom");
});

// ─── Scheduler regression ─────────────────────────────────────────────────────

test("formatMangoTraffic: 90 000 s → 25:00:00 (not 01:00:00)", () => {
  assert.equal(formatMangoTraffic(90_000), "25:00:00");
});
