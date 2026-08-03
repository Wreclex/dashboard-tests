---
name: Mango Office authentication approach
description: Mango CCC auth uses server-side headless-browser login (playwright-core + system chromium); tokens from localStorage are useless server-side
---

## Rule
`api2.mangotele.com` authenticates via the **`jwt_token` query parameter** (`?jwt_token=<JWT>&app=webcov`), NOT `Authorization: Bearer` (Bearer is ignored → bare 403; a bad jwt_token yields `{"code":0,"Wrong number of segments"}` = JWT parse error). Mango CCC also enforces **single-session**: a headless login succeeds but is kicked out within seconds (`POST /logoff`) while the user is logged into CCC themselves. Therefore: primary path = user pastes `auth_token||refresh_token` from their own session (DevTools console one-liner), server refreshes via `auth.mango-office.ru/refresh`; headless-browser login (email+password, playwright-core) is only a fallback and fails whenever the user is concurrently logged in.

**Why:** Proven by live network capture (Aug 2026): CCC SPA calls api2 with `?jwt_token=`, and our headless session got logged off by the concurrent user session.

**How to apply:**
- Login page selectors: `input[type="text"]`, `input[type="password"]`, `button[type="submit"]` on the SSO redirect page.
- Browser login takes up to 60s; callers need a ≥65s budget (scheduler uses 120s).
- `playwright-core` + `chromium-bidi` must stay in the esbuild `external` list in `artifacts/api-server/build.mjs` or the bundle breaks.
- Migration 0003 cleared legacy rows; `bearer_token`-era data is gone. If Mango adds captcha/2FA for a user, login times out → 401 auth_failed; user must retry.
