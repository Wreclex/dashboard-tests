---
name: Mango Office authentication approach
description: Mango CCC auth uses server-side headless-browser login (playwright-core + system chromium); tokens from localStorage are useless server-side
---

## Rule
Store the user's Mango CCC email + password (AES-256-GCM in `mango_credentials`). The server logs in via headless Chromium (playwright-core, `executablePath` from `which chromium`, args `--no-sandbox --disable-dev-shm-usage`) on `ccc.mango-office.ru`, reads `auth_token`/`refresh_token` from localStorage, caches them encrypted in the same table. KPI fetch order: cached token → `auth.mango-office.ru/refresh` → browser re-login. Single-flight Map dedupes concurrent logins per user.

**Why:** Mango SSO (`auth.mango-office.ru/sso/login`, OAuth PKCE) rejects direct API sign-in (code 1102). The `auth_token` from a human browser session gets HTTP 403 from `api2.mangotele.com` when used server-side (audience/IP binding) — bookmarklet/DevTools token extraction is a dead end. Only a server-side browser session produces working tokens.

**How to apply:**
- Login page selectors: `input[type="text"]`, `input[type="password"]`, `button[type="submit"]` on the SSO redirect page.
- Browser login takes up to 60s; callers need a ≥65s budget (scheduler uses 120s).
- `playwright-core` + `chromium-bidi` must stay in the esbuild `external` list in `artifacts/api-server/build.mjs` or the bundle breaks.
- Migration 0003 cleared legacy rows; `bearer_token`-era data is gone. If Mango adds captcha/2FA for a user, login times out → 401 auth_failed; user must retry.
