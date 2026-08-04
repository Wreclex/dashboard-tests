/**
 * Mango Office CCC headless-browser sign-in ("парсер").
 *
 * The Mango SSO login (auth.mango-office.ru/sso/login, OAuth PKCE) rejects
 * direct API calls (code 1102), so we drive the real login page with headless
 * Chromium instead: fill email + password, submit, wait for the redirect back
 * to ccc.mango-office.ru, then harvest the session from localStorage — exactly
 * what a human browser session produces:
 *   jwt_token                      — RS256 JWT accepted by api2.mangotele.com
 *                                    (TTL ~20 h; the HS256 auth_token is NOT
 *                                    accepted by the KPI API)
 *   current_member                 — member id, e.g. "20312007"
 *   <member_id>.operator_groups    — JSON array of operator group ids,
 *                                    required by the KPI report endpoint
 *                                    (0 rows without GroupId[])
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

export type MangoBrowserSession = {
  /** RS256 `jwt_token` — the only token api2.mangotele.com accepts. */
  jwtToken: string;
  /** Operator group IDs (GroupId[] report params) from localStorage. */
  operatorGroups: number[];
};

/**
 * Only one Chromium login at a time.
 *
 * A login costs a full browser plus up to a minute of page work. Several
 * callers can want one at once — a dashboard refresh, a manager saving
 * credentials, the report scheduler — and running them in parallel exhausts
 * the container's memory long before it helps anyone. Queueing keeps peak
 * usage at exactly one browser.
 */
let loginQueue: Promise<unknown> = Promise.resolve();

/**
 * Log into Mango CCC with email + password and return fresh tokens.
 * Serialized process-wide; concurrent callers wait their turn.
 *
 * @throws MangoAuthError            — wrong credentials / login rejected
 * @throws MangoKpiUnavailableError  — infrastructure problems (browser, network, timeout)
 */
export function mangoBrowserLogin(
  email: string,
  password: string,
  timeoutMs: number = LOGIN_TIMEOUT_MS,
): Promise<MangoBrowserSession> {
  const next = loginQueue
    .catch(() => {}) // one caller's failure must not poison the queue
    .then(() => runMangoBrowserLogin(email, password, timeoutMs));
  loginQueue = next;
  return next;
}

async function runMangoBrowserLogin(
  email: string,
  password: string,
  timeoutMs: number,
): Promise<MangoBrowserSession> {
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
        const harvested = await page.evaluate(() => {
          const member = localStorage.getItem("current_member");
          let groups: unknown = null;
          try {
            groups = member
              ? JSON.parse(localStorage.getItem(`${member}.operator_groups`) ?? "null")
              : null;
          } catch {
            groups = null; // malformed JSON — treat as missing
          }
          return { jwt: localStorage.getItem("jwt_token"), groups };
        });
        const operatorGroups = Array.isArray(harvested.groups)
          ? harvested.groups.filter(
              (g): g is number => typeof g === "number" && Number.isFinite(g) && g > 0,
            )
          : [];
        if (harvested.jwt && operatorGroups.length > 0) {
          return {
            jwtToken: harvested.jwt.trim().replace(/^"+|"+$/g, ""),
            operatorGroups,
          };
        }
        // After login the CCC shows a "Начать" gate — click it to enter the app.
        await page
          .evaluate(() => {
            const doc = (globalThis as { document?: { querySelectorAll(s: string): ArrayLike<{ textContent?: string | null; click(): void }> } }).document;
            if (!doc) return;
            const buttons = Array.from(doc.querySelectorAll("button"));
            const start = buttons.find((b) => /начать/i.test(b.textContent ?? ""));
            start?.click();
          })
          .catch(() => {});
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
