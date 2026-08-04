/**
 * The guarantee under test: no client-facing Mango read can hang.
 *
 * Every Mango KPI endpoint — the dashboard's personal and team reads, the
 * operator directory, and the Report Tool's own KPI — goes through
 * `ensureSnapshotWithin` before touching a snapshot. Mango itself can take
 * tens of seconds for a report and up to a minute for a headless re-login, so
 * these tests pin down that the read returns within its grace period even when
 * the refresh never finishes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ensureSnapshotWithin, type MangoSessionInfo } from "./mangoSnapshotPolicy.ts";

const GRACE_MS = 60;

const okInfo: MangoSessionInfo = { state: "ok", message: null, checkedAt: null };
const expiredInfo: MangoSessionInfo = {
  state: "reauth_required",
  message: "Mango rejected the stored login",
  checkedAt: new Date("2026-08-04T10:00:00Z"),
};

/** A refresh that never settles — stands in for a stuck Mango login. */
function neverSettles(): Promise<void> {
  return new Promise<void>(() => {});
}

describe("ensureSnapshotWithin", () => {
  it("returns within the grace period when nothing is cached and the refresh hangs", async () => {
    const started = Date.now();
    const outcome = await ensureSnapshotWithin({
      info: okInfo,
      snapshot: null,
      isRefreshing: false,
      start: neverSettles,
      graceMs: GRACE_MS,
    });
    const elapsed = Date.now() - started;

    assert.equal(outcome, "waited");
    assert.ok(elapsed < GRACE_MS * 10, `waited ${elapsed}ms, expected well under the grace period`);
  });

  it("returns within the grace period when the cached session was rejected", async () => {
    // Expired session + no snapshot is the worst case: the refresh has to run
    // a full headless login, which must never be awaited by the request.
    const started = Date.now();
    const outcome = await ensureSnapshotWithin({
      info: { ...expiredInfo, checkedAt: null },
      snapshot: null,
      isRefreshing: false,
      start: neverSettles,
      graceMs: GRACE_MS,
    });

    assert.equal(outcome, "waited");
    assert.ok(Date.now() - started < GRACE_MS * 10);
  });

  it("serves stale numbers immediately instead of waiting for the refresh", async () => {
    let startedRefresh = false;
    const outcome = await ensureSnapshotWithin({
      info: okInfo,
      snapshot: { fetchedAt: new Date(Date.now() - 60 * 60_000) },
      isRefreshing: false,
      start: () => {
        startedRefresh = true;
        return neverSettles();
      },
      graceMs: GRACE_MS,
    });

    assert.equal(outcome, "stale_while_revalidate");
    assert.ok(startedRefresh, "a background refresh should have been kicked off");
  });

  it("does not touch Mango when the snapshot is current", async () => {
    let startedRefresh = false;
    const outcome = await ensureSnapshotWithin({
      info: okInfo,
      snapshot: { fetchedAt: new Date() },
      isRefreshing: false,
      start: () => {
        startedRefresh = true;
        return neverSettles();
      },
      graceMs: GRACE_MS,
    });

    assert.equal(outcome, "fresh");
    assert.equal(startedRefresh, false);
  });

  it("backs off after a rejected login instead of retrying on every request", async () => {
    let attempts = 0;
    const outcome = await ensureSnapshotWithin({
      info: { ...expiredInfo, checkedAt: new Date("2026-08-04T10:00:00Z") },
      snapshot: null,
      isRefreshing: false,
      start: () => {
        attempts += 1;
        return neverSettles();
      },
      graceMs: GRACE_MS,
      now: new Date("2026-08-04T10:00:30Z").getTime(),
    });

    assert.equal(outcome, "cooling_down");
    assert.equal(attempts, 0, "a 30s-old auth failure must not trigger another login");
  });

  it("ignores freshness and the cooldown when the user explicitly reconnects", async () => {
    let attempts = 0;
    const outcome = await ensureSnapshotWithin({
      info: { ...expiredInfo, checkedAt: new Date("2026-08-04T10:00:00Z") },
      snapshot: { fetchedAt: new Date() },
      isRefreshing: false,
      start: () => {
        attempts += 1;
        return neverSettles();
      },
      force: true,
      graceMs: GRACE_MS,
      now: new Date("2026-08-04T10:00:30Z").getTime(),
    });

    assert.equal(outcome, "waited");
    assert.equal(attempts, 1);
  });
});
