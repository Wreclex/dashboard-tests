/**
 * Tests for the team (per-operator) Mango KPI parsing and the memberId
 * override used by the multi-user dashboard.
 *
 * All imports come from mangoKpiFormat.ts (no I/O or encryption deps).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  MangoKpiUnavailableError,
  fetchMangoKpi,
  fetchMangoTeamKpi,
  parseMangoTeamRows,
  type FetchFn,
} from "./mangoKpiFormat.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sequentialFetch(responses: Response[]): FetchFn {
  let i = 0;
  return async () => {
    if (i >= responses.length) throw new Error(`sequentialFetch: call ${i} has no response`);
    return responses[i++]!;
  };
}

const TOKEN_MEMBER_ID = 7;
const TEST_TOKEN = `h.${Buffer.from(JSON.stringify({ data: { member_id: TOKEN_MEMBER_ID } })).toString("base64url")}.s`;

function row(memberId: number, name: string, calls: number, traffic: string) {
  return {
    member_id: memberId,
    member_name: name,
    "count-outbound-total-calls": calls,
    "count-received-calls": 0,
    "total-time-external-calls": traffic,
  };
}

// ─── parseMangoTeamRows ─────────────────────────────────────────────────────

test("team rows: one entry per operator with names and KPI", () => {
  const payload = {
    data: [
      row(1, "Иван", 10, "01:00:00"),
      row(2, "Мария", 5, "00:30:00"),
      row(3, "Пётр", 0, "00:00:00"),
    ],
  };
  const members = parseMangoTeamRows(payload);
  assert.ok(members);
  assert.equal(members.length, 3);
  assert.deepEqual(
    members.find((m) => m.memberId === 1),
    { memberId: 1, memberName: "Иван", calls: 10, trafficSeconds: 3600 },
  );
  assert.deepEqual(
    members.find((m) => m.memberId === 2),
    { memberId: 2, memberName: "Мария", calls: 5, trafficSeconds: 1800 },
  );
});

test("team rows: falls back to grouped and aggregates duplicate member rows", () => {
  const payload = {
    data: [{ unrelated: true }],
    grouped: [row(9, "Анна", 3, "00:10:00"), row(9, "Анна", 4, "00:05:00")],
  };
  const members = parseMangoTeamRows(payload);
  assert.ok(members);
  assert.equal(members.length, 1);
  assert.equal(members[0]!.calls, 7);
  assert.equal(members[0]!.trafficSeconds, 900);
});

test("team rows: skips rows without a numeric member_id, names fall back to id", () => {
  const payload = {
    data: [
      { member_id: "not-a-number", "count-outbound-total-calls": 5, "total-time-external-calls": "00:01:00" },
      { member_id: 42, "count-outbound-total-calls": 2, "total-time-external-calls": "00:02:00" },
    ],
  };
  const members = parseMangoTeamRows(payload);
  assert.ok(members);
  assert.equal(members.length, 1);
  assert.equal(members[0]!.memberId, 42);
  assert.equal(members[0]!.memberName, "Оператор 42");
});

test("team rows: returns null for handshake body, garbage, and empty data", () => {
  assert.equal(parseMangoTeamRows({ key: "abc" }), null);
  assert.equal(parseMangoTeamRows("nope"), null);
  assert.equal(parseMangoTeamRows({ data: [] }), null);
  assert.equal(parseMangoTeamRows({ data: [{ no: "kpi fields" }] }), null);
});

// ─── fetchMangoTeamKpi ──────────────────────────────────────────────────────

test("fetchMangoTeamKpi: handshake then result returns all operators", async () => {
  const fetchFn = sequentialFetch([
    jsonResponse({ key: "report-key" }, 202),
    jsonResponse({ data: [row(1, "Иван", 4, "00:20:00"), row(2, "Мария", 6, "00:40:00")] }),
  ]);
  const members = await fetchMangoTeamKpi(TEST_TOKEN, [123], fetchFn, 0);
  assert.equal(members.length, 2);
  assert.equal(members[1]!.memberName, "Мария");
});

test("fetchMangoTeamKpi: fails explicitly when operator rows are undecodable", async () => {
  const fetchFn = sequentialFetch([
    jsonResponse({ data: [{ something: "unexpected" }] }),
  ]);
  await assert.rejects(fetchMangoTeamKpi(TEST_TOKEN, [123], fetchFn, 0), MangoKpiUnavailableError);
});

// ─── fetchMangoKpi memberId override ────────────────────────────────────────

test("fetchMangoKpi with memberIdOverride scopes to that operator, not the token owner", async () => {
  const fetchFn = sequentialFetch([
    jsonResponse({
      data: [row(TOKEN_MEMBER_ID, "Владелец токена", 100, "10:00:00"), row(2, "Мария", 6, "00:40:00")],
    }),
  ]);
  const kpi = await fetchMangoKpi(TEST_TOKEN, [123], fetchFn, 0, undefined, 2);
  assert.deepEqual(kpi, { calls: 6, trafficSeconds: 2400 });
});

test("fetchMangoKpi without override still scopes to the token member", async () => {
  const fetchFn = sequentialFetch([
    jsonResponse({
      data: [row(TOKEN_MEMBER_ID, "Владелец токена", 3, "00:15:00"), row(2, "Мария", 6, "00:40:00")],
    }),
  ]);
  const kpi = await fetchMangoKpi(TEST_TOKEN, [123], fetchFn, 0);
  assert.deepEqual(kpi, { calls: 3, trafficSeconds: 900 });
});

test("fetchMangoKpi fails closed when neither override nor token member is decodable", async () => {
  const fetchFn = sequentialFetch([]);
  await assert.rejects(
    fetchMangoKpi("not-a-jwt", [123], fetchFn, 0),
    MangoKpiUnavailableError,
  );
});
