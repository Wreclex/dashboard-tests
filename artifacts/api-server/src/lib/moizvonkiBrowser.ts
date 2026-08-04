/**
 * «Мои Звонки» headless-browser collector (Variant B).
 *
 * Mirrors the Mango approach: drive the real ЛК with headless Chromium —
 * log in with the stored login + password, open the dashboard, click
 * «Сформировать», then harvest the metrics from the XHR/JSON responses the
 * page itself makes (falling back to the rendered DOM text).
 *
 * On success we also harvest the session cookie header + the data request URL
 * so later runs can use the fast cookie-replay path (Variant A) without
 * launching a browser at all.
 */

import { execSync } from "node:child_process";
import { chromium } from "playwright-core";
import { extractMetrics, MoizvonkiParseError, type RawMetrics } from "./moizvonkiParse.ts";

const DASHBOARD_URL = "https://ukmain.moizvonki.ru/dashboard/";
const DEFAULT_TIMEOUT_MS = 90_000;

export class MoizvonkiAuthError extends Error {
  constructor(message = "«Мои Звонки» отклонил логин/пароль") {
    super(message);
    this.name = "MoizvonkiAuthError";
  }
}

export class MoizvonkiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoizvonkiUnavailableError";
  }
}

export type MoizvonkiBrowserResult = RawMetrics & {
  /** Session cookie header harvested after login — reusable for Variant A. */
  cookieHeader: string | null;
  /** The request URL whose response contained the metrics, if captured. */
  dataRequestUrl: string | null;
};

function chromiumPath(): string {
  if (process.env.MANGO_CHROMIUM_PATH) return process.env.MANGO_CHROMIUM_PATH;
  try {
    return execSync("which chromium").toString().trim();
  } catch {
    throw new MoizvonkiUnavailableError("Chromium is not installed on this server");
  }
}

/**
 * Log into ukmain.moizvonki.ru, build the report and extract metrics.
 *
 * @throws MoizvonkiAuthError        — login rejected / captcha
 * @throws MoizvonkiUnavailableError — infrastructure or changed markup
 */
export async function collectViaBrowser(
  login: string,
  password: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<MoizvonkiBrowserResult> {
  const browser = await chromium
    .launch({ executablePath: chromiumPath(), args: ["--no-sandbox", "--disable-dev-shm-usage"] })
    .catch((err) => {
      throw new MoizvonkiUnavailableError(
        `Failed to launch headless browser: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      locale: "ru-RU",
    });
    const page = await context.newPage();

    // Capture JSON responses — the report data usually arrives via XHR.
    const captured: Array<{ url: string; body: unknown }> = [];
    page.on("response", (response) => {
      const type = response.request().resourceType();
      if (type !== "xhr" && type !== "fetch") return;
      response
        .json()
        .then((body) => captured.push({ url: response.url(), body }))
        .catch(() => {});
    });

    await page.goto(DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });

    // If a login form is shown, fill it in.
    const passwordInput = page.locator('input[type="password"]');
    if (await passwordInput.count().catch(() => 0)) {
      const loginInput = page.locator(
        'input[type="text"], input[type="email"], input[name*="login" i], input[name*="email" i], input[name*="user" i]',
      ).first();
      await loginInput.fill(login, { timeout: 15_000 }).catch(() => {});
      await passwordInput.first().fill(password, { timeout: 15_000 });
      const submit = page.locator('button[type="submit"], input[type="submit"]').first();
      await submit.click({ timeout: 10_000 }).catch(async () => {
        await passwordInput.first().press("Enter").catch(() => {});
      });

      // Wait until we leave the login page; error text means rejection.
      const deadline = Date.now() + 45_000;
      while (Date.now() < deadline) {
        await page.waitForTimeout(1_000);
        if (!page.url().match(/login|auth|signin/i)) break;
        const errText = await page
          .locator('[class*="error" i], [class*="alert" i]')
          .first()
          .textContent()
          .catch(() => null);
        if (errText && errText.trim().length > 2) {
          throw new MoizvonkiAuthError(`«Мои Звонки» отклонил вход: ${errText.trim().slice(0, 200)}`);
        }
      }
      if (page.url().match(/login|auth|signin/i)) {
        throw new MoizvonkiAuthError(
          "«Мои Звонки» не принял логин/пароль или запросил капчу. Проверьте данные и попробуйте снова",
        );
      }
    }

    // Open the dashboard and click «Сформировать».
    if (!page.url().startsWith(DASHBOARD_URL)) {
      await page.goto(DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    }
    const buildButton = page
      .locator('button:has-text("Сформировать"), input[value*="Сформировать" i], a:has-text("Сформировать")')
      .first();
    if (await buildButton.count().catch(() => 0)) {
      await buildButton.click({ timeout: 15_000 }).catch(() => {});
    }

    // Give the report time to load.
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(2_000);

    // 1) Try captured JSON responses first (most reliable).
    let metrics: RawMetrics | null = null;
    let dataRequestUrl: string | null = null;
    for (const { url, body } of [...captured].reverse()) {
      try {
        metrics = extractMetrics(body);
        dataRequestUrl = url;
        break;
      } catch {
        // not the data response — keep looking
      }
    }

    // 2) Fall back to the rendered page text.
    if (!metrics) {
      const text = await page
        .evaluate(() => {
          const doc = (globalThis as { document?: { body?: { innerText?: string } } }).document;
          return doc?.body?.innerText ?? "";
        })
        .catch(() => "");
      try {
        metrics = extractMetrics(text);
      } catch (err) {
        if (err instanceof MoizvonkiParseError) {
          throw new MoizvonkiUnavailableError(
            `Не удалось извлечь метрики со страницы ЛК: ${err.message}`,
          );
        }
        throw err;
      }
    }

    // Harvest session cookies for the fast Variant-A path next time.
    const cookies = await context.cookies("https://ukmain.moizvonki.ru").catch(() => []);
    const cookieHeader = cookies.length
      ? cookies.map((c) => `${c.name}=${c.value}`).join("; ")
      : null;

    return { ...metrics, cookieHeader, dataRequestUrl };
  } catch (err) {
    if (err instanceof MoizvonkiAuthError || err instanceof MoizvonkiUnavailableError) throw err;
    throw new MoizvonkiUnavailableError(
      `Сбор через браузер не удался: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    await browser.close().catch(() => {});
  }
}
