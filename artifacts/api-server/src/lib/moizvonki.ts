/**
 * «Мои Звонки» collection orchestrator — two tiers, same shape as the Mango flow:
 *
 *  1. Variant A (fast): replay the stored internal report request with the
 *     stored Cookie header. On 401/403 or an HTML login page the session is
 *     considered expired → fall through.
 *  2. Variant B (slow): full headless-browser login with the stored
 *     login + password, harvesting fresh cookies + the data request URL back
 *     into the connection row for the next fast run.
 *
 *  Variant C (manual CSV upload) lives in moizvonkiCsv.ts and is invoked
 *  directly from the upload route.
 */

import { db, moizvonkiConnections, moizvonkiMetrics, moizvonkiSettings } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decryptToken, encryptToken } from "./encrypt.ts";
import { extractMetrics, type RawMetrics } from "./moizvonkiParse.ts";
import {
  collectViaBrowser,
  MoizvonkiAuthError,
  MoizvonkiUnavailableError,
} from "./moizvonkiBrowser.ts";

export { MoizvonkiAuthError, MoizvonkiUnavailableError } from "./moizvonkiBrowser.ts";
export { MoizvonkiCsvError, parseMoizvonkiCsv } from "./moizvonkiCsv.ts";
export { MoizvonkiParseError } from "./moizvonkiParse.ts";

/** Today in Moscow as ISO YYYY-MM-DD (the ЛК reports in Moscow time). */
export function todayMoscowIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** ISO YYYY-MM-DD → DD.MM.YYYY for display. */
export function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** DD.MM.YYYY → ISO YYYY-MM-DD, or null when malformed. */
export function displayToIso(display: string): string | null {
  const m = display.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export async function getSettings(userId: string): Promise<{ shiftHours: number; refreshIntervalMinutes: number }> {
  const [row] = await db
    .select()
    .from(moizvonkiSettings)
    .where(eq(moizvonkiSettings.id, userId))
    .limit(1);
  return row
    ? { shiftHours: row.shiftHours, refreshIntervalMinutes: row.refreshIntervalMinutes }
    : { shiftHours: 9.5, refreshIntervalMinutes: 15 };
}

/** Persist a metrics point and record the success on the connection row. */
export async function storeMetrics(
  userId: string,
  dateIso: string,
  metrics: RawMetrics,
  source: "http" | "browser" | "csv",
): Promise<void> {
  await db
    .insert(moizvonkiMetrics)
    .values({ userId, date: dateIso, calls: metrics.calls, trafficSeconds: metrics.trafficSeconds, source })
    .onConflictDoUpdate({
      target: [moizvonkiMetrics.userId, moizvonkiMetrics.date],
      set: {
        calls: metrics.calls,
        trafficSeconds: metrics.trafficSeconds,
        source,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(moizvonkiConnections)
    .values({ id: userId, lastFetchAt: new Date(), lastError: null, lastSource: source })
    .onConflictDoUpdate({
      target: moizvonkiConnections.id,
      set: { lastFetchAt: new Date(), lastError: null, lastSource: source, updatedAt: new Date() },
    });
}

export async function recordError(userId: string, message: string): Promise<void> {
  await db
    .insert(moizvonkiConnections)
    .values({ id: userId, lastError: message.slice(0, 500) })
    .onConflictDoUpdate({
      target: moizvonkiConnections.id,
      set: { lastError: message.slice(0, 500), updatedAt: new Date() },
    })
    .catch(() => {});
}

/** Variant A — replay the stored report request with the stored cookies. */
async function collectViaHttp(cookies: string, reportUrl: string, extraHeaders: string | null): Promise<RawMetrics> {
  const headers: Record<string, string> = {
    Cookie: cookies,
    Accept: "application/json, text/plain, */*",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    Referer: "https://ukmain.moizvonki.ru/dashboard/",
  };
  if (extraHeaders) {
    try {
      const parsed = JSON.parse(extraHeaders) as Record<string, string>;
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string" && k.toLowerCase() !== "cookie") headers[k] = v;
      }
    } catch {
      // malformed extra headers — ignore, they're optional
    }
  }

  let res: Response;
  try {
    res = await fetch(reportUrl, { headers, signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    throw new MoizvonkiUnavailableError(
      `Сетевой сбой при запросе отчёта: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new MoizvonkiAuthError("Сессия «Мои Звонки» истекла — обновите cookies");
  }
  if (!res.ok) {
    throw new MoizvonkiUnavailableError(`Сервер «Мои Звонки» вернул HTTP ${res.status}`);
  }

  const text = await res.text();
  // An HTML page here almost always means a redirect to the login form.
  if (/^\s*<!doctype html|^\s*<html/i.test(text)) {
    throw new MoizvonkiAuthError("Сессия «Мои Звонки» истекла — обновите cookies");
  }
  return extractMetrics(text);
}

/**
 * Collect today's metrics: cookies first, headless browser fallback.
 * Persists the result on success and the error on failure.
 *
 * @throws MoizvonkiAuthError        — re-configuration required (401)
 * @throws MoizvonkiUnavailableError — transient / infrastructure failure (502)
 */
export async function refreshMoizvonki(userId: string): Promise<RawMetrics & { source: "http" | "browser" }> {
  const [conn] = await db
    .select()
    .from(moizvonkiConnections)
    .where(eq(moizvonkiConnections.id, userId))
    .limit(1);

  const cookies = conn?.cookies ? decryptToken(conn.cookies).trim() : "";
  const reportUrl = conn?.reportUrl?.trim() ?? "";
  const extraHeaders = conn?.headers ? decryptToken(conn.headers).trim() : null;
  const login = conn?.login ? decryptToken(conn.login).trim() : "";
  const password = conn?.password ? decryptToken(conn.password) : "";

  if (!cookies && !login) {
    throw new MoizvonkiUnavailableError(
      "Подключение не настроено: задайте cookies + URL запроса или логин/пароль",
    );
  }

  // ── Tier 1: cookie replay ─────────────────────────────────────────────────
  if (cookies && reportUrl) {
    try {
      const metrics = await collectViaHttp(cookies, reportUrl, extraHeaders);
      await storeMetrics(userId, todayMoscowIso(), metrics, "http");
      return { ...metrics, source: "http" };
    } catch (err) {
      if (err instanceof MoizvonkiUnavailableError || !login) {
        // No credentials to fall back to — surface the original failure.
        if (!(err instanceof MoizvonkiAuthError) || !login) {
          await recordError(userId, err instanceof Error ? err.message : String(err));
          throw err;
        }
      }
      // Expired session + we have credentials → try the browser tier.
    }
  }

  // ── Tier 2: headless browser ──────────────────────────────────────────────
  if (!login || !password) {
    const msg = "Сессия истекла, а логин/пароль не заданы — обновите cookies или добавьте логин/пароль";
    await recordError(userId, msg);
    throw new MoizvonkiAuthError(msg);
  }

  try {
    const result = await collectViaBrowser(login, password);
    await storeMetrics(userId, todayMoscowIso(), result, "browser");

    // Harvest the session back into the connection row for fast future runs.
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (result.cookieHeader) set.cookies = encryptToken(result.cookieHeader);
    if (result.dataRequestUrl) set.reportUrl = result.dataRequestUrl;
    if (Object.keys(set).length > 1) {
      await db
        .update(moizvonkiConnections)
        .set(set)
        .where(eq(moizvonkiConnections.id, userId))
        .catch(() => {});
    }
    return { ...result, source: "browser" };
  } catch (err) {
    await recordError(userId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
