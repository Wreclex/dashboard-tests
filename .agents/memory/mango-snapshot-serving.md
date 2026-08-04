---
name: Mango KPI must be served from a snapshot
description: Why dashboard requests never call Mango synchronously, and how the background refresh tiers work.
---

# Never call Mango inside a request

A Mango KPI read is a report handshake plus polling (tens of seconds), and a
re-login is a headless Chromium session (up to ~60s more). Doing this inside an
HTTP handler produced ~67s requests that ended in 401 — the dashboard appeared
to hang and then failed.

**Rule:** dashboard/API requests read the last stored snapshot and trigger a
background refresh. A first-ever load may wait a few seconds for that refresh,
then answers regardless. Every response carries an explicit connection state
(`ok` / `refreshing` / `reauth_required` / `unavailable` / `not_configured` /
`operator_not_claimed`) plus the snapshot timestamp, so the UI can show stale
numbers with an honest label instead of a spinner.

**Why:** Mango latency is unbounded and cannot be made reliable; only the read
path can be made reliable.

**How to apply:** two tiers in the background job — reuse the cached session
first (never logs in), and only after a token-expiry error fall back to a full
re-login. Cache the *failures* too, with a cooldown, or every page load
restarts a minute-long login. One team report already contains a row per
operator, so a single refresh can fill both the team and every personal
snapshot.

Chromium logins must be serialized process-wide. Several callers legitimately
want one at the same time (dashboard refresh, credential save, report
scheduler) and parallel browsers exhaust container memory.
