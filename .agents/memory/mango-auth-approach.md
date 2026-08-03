---
name: Mango Office authentication approach
description: Why we use email+password auto-sign-in instead of bearer token interception for Mango CCC
---

## Rule
Store the user's Mango CCC email + password (both AES-256-GCM encrypted in `mango_credentials`). On every KPI request, the backend automatically calls `POST https://api2.mangotele.com/v2/auth/sign-in` with `{ email, password }` to get a fresh Bearer token, then uses it for the KPI fetch.

**Why:** The Mango CCC dashboard (`ccc.mango-office.ru`) does NOT expose Authorization Bearer tokens in fetch/XHR request headers — it uses cookie-based auth internally. The bookmarklet approach of intercepting headers never catches any token. Email+password is the only autonomous (no-DevTools) option.

**How to apply:**
- `MangoAuthError` (from `mangoAuth.ts`) is thrown when sign-in returns 400/401/403 — surface this as HTTP 401 with `{ error: "auth_failed" }` to the frontend.
- The modal shows "Неверный логин или пароль" on `auth_failed` and prompts the user to re-enter.
- Sign-in endpoint: `POST https://api2.mangotele.com/v2/auth/sign-in` body `{ "email": "...", "password": "..." }` → response `{ "token": "..." }`.
- If Mango changes this endpoint path, adjust `MANGO_AUTH_URL` in `artifacts/api-server/src/lib/mangoAuth.ts`.
