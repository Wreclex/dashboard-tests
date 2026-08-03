/**
 * Mango Office CCC headless-browser sign-in ("парсер").
 *
 * The Mango SSO login (auth.mango-office.ru/sso/login, OAuth PKCE) rejects
 * direct API calls (code 1102), so we drive the real login page with headless
 * Chromium instead: fill email + password, submit, wait for the redirect back
 * to ccc.mango-office.ru, then read auth_token / refresh_token from
 * localStorage — exactly what a human browser session produces.
 *
 * Selectors verified against the live page (Aug 2026):
 *   input[type="text"]      — login field
 *   input[type="password"]  — password field
 *   button[type="submit"]   — "Войти"
 */

import { execSync } from "node:child_process";
import { chromium } from "playwright-core";
import { MangoAuthError } from "./mangoAuth.ts";
import { MangoKpiUnavailableError } from "./mangoKpiFormat.ts";

const CCC_URL = "https://ccc.mango-office.ru/";
const LOGIN_TIMEOUT_MS = 60_000;

function chromiumPath(): string {
  if (process.env.MANGO_CHROMIUM_PATH) return process.env.MANGO_CHROMIUM_PATH;
  try {
    return execSync("which chromium").toString().trim();
  } catch {
    throw new MangoKpiUnavailableError("Chromium is not installed on this server");
  }
}

export type MangoBrowserTokens = { authToken: string; refreshToken: string };

/**
 * Log into Mango CCC with email + password and return fresh tokens.
 *
 * @throws MangoAuthError            — wrong credentials / login rejected
 * @throws MangoKpiUnavailableError  — infrastructure problems (browser, network, timeout)
 */
export async function mangoBrowserLogin(
  email: string,
  password: string,
  timeoutMs: number = LOGIN_TIMEOUT_MS,
): Promise<MangoBrowserTokens> {
  const browser = await chromium
    .launch({ executablePath: chromiumPath(), args: ["--no-sandbox", "--disable-dev-shm-usage"] })
    .catch((err) => {
      throw new MangoKpiUnavailableError(
        `Failed to launch headless browser: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      locale: "ru-RU",
    });

    await page.goto(CCC_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });

    // The unauthenticated app redirects to auth.mango-office.ru/sso/login.
    await page.waitForSelector('input[type="password"]', { timeout: 30_000 }).catch(() => {
      throw new MangoKpiUnavailableError("Mango login form did not appear");
    });

    await page.fill('input[type="text"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    // Wait for either: redirect back to ccc.mango-office.ru with tokens in
    // localStorage, or an error message on the auth page.
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await page.waitForTimeout(1_000);
      const url = page.url();

      if (url.startsWith(CCC_URL)) {
        const tokens = await page.evaluate(() => ({
          auth: localStorage.getItem("auth_token"),
          refresh: localStorage.getItem("refresh_token"),
        }));
        if (tokens.auth) {
          const clean = (v: string) => v.trim().replace(/^"+|"+$/g, "");
          return {
            authToken: clean(tokens.auth),
            refreshToken: tokens.refresh ? clean(tokens.refresh) : clean(tokens.auth),
          };
        }
        continue; // SPA still booting — tokens not written yet
      }

      // Still on the auth page — check for a visible error message.
      const errText = await page
        .evaluate(() => {
          const g = globalThis as {
            document?: {
              querySelector(s: string): { textContent?: string | null } | null;
            };
          };
          const el = g.document?.querySelector(
            '.auth-loginpass__error, .dct-input__error, [class*="error"]',
          );
          const t = el?.textContent?.trim();
          return t && t.length > 2 ? t : null;
        })
        .catch(() => null);
      if (errText) {
        throw new MangoAuthError(`Mango отклонил вход: ${errText.slice(0, 200)}`);
      }
    }

    // Still on the auth page after the deadline: wrong credentials or a
    // captcha/2FA challenge. Either way the stored credentials did not log us in.
    throw new MangoAuthError(
      "Mango не принял логин/пароль или запросил капчу. Проверьте данные и попробуйте снова",
    );
  } catch (err) {
    // Normalize Playwright operational failures (navigation timeouts, selector
    // misses, crashed pages) into MangoKpiUnavailableError → HTTP 502.
    if (err instanceof MangoAuthError || err instanceof MangoKpiUnavailableError) throw err;
    throw new MangoKpiUnavailableError(
      `Mango headless login failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    await browser.close().catch(() => {});
  }
}
