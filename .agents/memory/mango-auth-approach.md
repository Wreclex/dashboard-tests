---
name: Mango Office authentication approach
description: Constraints of the Mango CCC KPI API and its headless sign-in — what the API accepts, what the login page rejects, and which session state must be treated as separately owned
---

## Protocol constraints

`api2.mangotele.com` (CCC KPI reports) accepts ONLY the **RS256 `jwt_token`** from a real CCC browser session, sent **inside an `application/x-www-form-urlencoded` body** — not a query param, not a Bearer header. The HS256 `auth_token` is login-only and is rejected.

- KPI reports REQUIRE `GroupId[]` (operator group IDs). Without them the report returns zero rows — never an error.
- The report is two-phase: handshake returns 202 + a key, then poll the result endpoint with the same body + key.
- `jwt_token` TTL ≈ 20 h, so one successful login per day suffices. **Refresh tokens cannot mint an RS256 JWT** — cached token, then a fresh headless login, are the only tiers.
- Mango enforces single-session: a headless login can kick the user's own CCC session and vice versa.
- The group report returns one row per member of the groups, so results MUST be scoped to a specific operator or a personal KPI silently becomes the whole team's. An undecodable member id must fail closed.
- Field semantics are counterintuitive: only incoming calls are counted in the "received" field, dial attempts live in the outbound-total field, and at least one "count"-named field is actually an "HH:MM:SS" duration. Verify a field's type against live data before trusting its name.

**Why:** Bearer auth, query-param JWTs, JSON bodies, refresh-token exchange, and token/group endpoints were all tried against production and failed; only the form-body protocol captured from real browser traffic returns data.

## Sign-in constraints

- The SSO page runs **Yandex SmartCaptcha in invisible mode**. It scores the browser and refuses automation *silently*: the page simply stays on the filled form with no error text, which is indistinguishable from a wrong password. A plain-browser fingerprint (no automation-controlled flag, no `navigator.webdriver`, ru-RU locale/timezone, real UA) plus per-key typing delays flips the same check to accepted.
- After sign-in the workspace sits behind a gate dialog that must be clicked before session keys are written; its label has already changed once. Match the gate by button text pattern, never a single fixed label.
- **A successful login no longer republishes the operator group list.** Treat that list as separately owned, persisted state: never overwrite it with an empty value, and fall back to the stored copy when a login returns none.

**Why:** Requiring the group list as proof of a successful login turned a perfectly good sign-in into a bogus "wrong login/password" error that looked like a credentials problem for days.

**How to apply:** Headless login needs a ≥65 s caller budget. When automation is genuinely blocked, the fallback is the user pasting their own token + groups from their browser session — keep that path working, and describe login failures honestly (captcha refusal ≠ bad credentials).
