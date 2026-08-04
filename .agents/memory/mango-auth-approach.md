---
name: Mango Office authentication approach
description: Mango KPI API requires the RS256 jwt_token from CCC localStorage sent in a form-urlencoded body with GroupId[]; headless browser login harvests it
---

## Rule
`api2.mangotele.com` (CCC KPI reports) accepts ONLY the **RS256 `jwt_token`** from CCC localStorage, sent **inside an `application/x-www-form-urlencoded` body** — not as a query param, not as a Bearer header. The HS256 `auth_token` is a login-only token; api2 rejects it ("Incorrect key for this algorithm"). Key protocol facts (all verified by live curl replay, Aug 2026):

- KPI reports REQUIRE `GroupId[]` form params (operator group IDs from localStorage `<member_id>.operator_groups`) — the report returns 0 rows without them.
- `total-time-external-calls` arrives as an **"HH:MM:SS" string**, not seconds (hours can exceed 24).
- Handshake `POST /v2/ccc/reports/oper-kpi2` returns **202 + {key}**; poll `POST .../oper-kpi2/result` with the same form body + `key`.
- `jwt_token` TTL ≈ 20 h → one successful login per day is enough.
- Mango **refresh tokens cannot mint RS256 JWTs** — the refresh tier was removed from the KPI flow; cached jwt_token → headless re-login are the only tiers.
- Mango enforces single-session: a headless login may kick the user's own CCC session (and vice versa). Tolerable because one login/day suffices — logins run at report time.
- The GroupId[] report returns **one row per member of the groups** — results MUST be scoped to the token's operator or the KPI sum includes every colleague's calls/traffic. The member id comes from the jwt itself (`payload.data.member_id`, object or JSON-string form); an undecodable member id must fail closed, never aggregate all members.

**Why:** Earlier attempts (Bearer auth_token, query-param jwt, JSON body, refresh-token exchange, group-list/token-exchange endpoints) all failed against production; only the captured browser-traffic form-body protocol returned real KPI data.

**How to apply:** Headless login (playwright-core, email+password) harvests `jwt_token`, `current_member`, and `<member>.operator_groups` in one pass and needs a ≥65 s caller budget (scheduler uses 120 s). Manual fallback when headless login is blocked: user pastes `jwt_token||operator_groups` copied via a DevTools console one-liner into PUT /mango/token.
