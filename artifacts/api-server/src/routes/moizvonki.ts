import { Router } from "express";
import { db, moizvonkiConnections, moizvonkiMetrics, moizvonkiSettings } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { encryptToken } from "../lib/encrypt";
import {
  CONNECTION_ID,
  SETTINGS_ID,
  MoizvonkiAuthError,
  MoizvonkiCsvError,
  MoizvonkiParseError,
  MoizvonkiUnavailableError,
  displayToIso,
  getSettings,
  isoToDisplay,
  parseMoizvonkiCsv,
  refreshMoizvonki,
  storeMetrics,
  todayMoscowIso,
} from "../lib/moizvonki";

const router = Router();

type MetricsPayload = {
  date: string;
  calls: number;
  trafficSeconds: number;
  shiftHours: number;
  density: number;
  source: string;
  updatedAt: string;
};

function toMetricsPayload(
  row: { date: string; calls: number; trafficSeconds: number; source: string; updatedAt: Date },
  shiftHours: number,
): MetricsPayload {
  return {
    date: isoToDisplay(row.date),
    calls: row.calls,
    trafficSeconds: row.trafficSeconds,
    shiftHours,
    density: shiftHours > 0 ? Math.round((row.calls / shiftHours) * 100) / 100 : 0,
    source: row.source,
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/status", async (req, res): Promise<void> => {
  try {
    const [conn] = await db
      .select()
      .from(moizvonkiConnections)
      .where(eq(moizvonkiConnections.id, CONNECTION_ID))
      .limit(1);
    const hasCookies = Boolean(conn?.cookies && conn?.reportUrl);
    const hasCredentials = Boolean(conn?.login && conn?.password);
    res.json({
      isConfigured: hasCookies || hasCredentials,
      hasCookies,
      hasCredentials,
      lastFetchAt: conn?.lastFetchAt?.toISOString() ?? null,
      lastError: conn?.lastError ?? null,
      lastSource: conn?.lastSource ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get Мои Звонки status");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** Variant A config: cookies + internal report URL copied from DevTools. */
router.put("/session", async (req, res): Promise<void> => {
  const { cookies, reportUrl, headers } = req.body ?? {};
  if (typeof cookies !== "string" || !cookies.trim() || typeof reportUrl !== "string" || !reportUrl.trim()) {
    res.status(400).json({ error: "cookies and reportUrl are required" });
    return;
  }
  try {
    const set: Record<string, unknown> = {
      cookies: encryptToken(cookies.trim()),
      reportUrl: reportUrl.trim(),
      updatedAt: new Date(),
    };
    if (typeof headers === "string" && headers.trim()) {
      set.headers = encryptToken(headers.trim());
    }
    await db
      .insert(moizvonkiConnections)
      .values({ id: CONNECTION_ID, ...set })
      .onConflictDoUpdate({ target: moizvonkiConnections.id, set });
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to store Мои Звонки session");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** Variant B config: login + password for automatic headless sign-in. */
router.put("/credentials", async (req, res): Promise<void> => {
  const { login, password } = req.body ?? {};
  if (typeof login !== "string" || !login.trim() || typeof password !== "string" || !password) {
    res.status(400).json({ error: "login and password are required" });
    return;
  }
  try {
    const set = {
      login: encryptToken(login.trim()),
      password: encryptToken(password),
      updatedAt: new Date(),
    };
    await db
      .insert(moizvonkiConnections)
      .values({ id: CONNECTION_ID, ...set })
      .onConflictDoUpdate({ target: moizvonkiConnections.id, set });
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to store Мои Звонки credentials");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/credentials", async (req, res): Promise<void> => {
  try {
    await db
      .update(moizvonkiConnections)
      .set({ login: null, password: null, cookies: null, reportUrl: null, headers: null, updatedAt: new Date() })
      .where(eq(moizvonkiConnections.id, CONNECTION_ID));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete Мои Звонки connection");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/metrics", async (req, res): Promise<void> => {
  try {
    const [row] = await db
      .select()
      .from(moizvonkiMetrics)
      .where(eq(moizvonkiMetrics.date, todayMoscowIso()))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "no_metrics_today" });
      return;
    }
    const { shiftHours } = await getSettings();
    res.json(toMetricsPayload(row, shiftHours));
  } catch (err) {
    req.log.error({ err }, "Failed to get Мои Звонки metrics");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/refresh", async (req, res): Promise<void> => {
  try {
    await refreshMoizvonki();
    const [row] = await db
      .select()
      .from(moizvonkiMetrics)
      .where(eq(moizvonkiMetrics.date, todayMoscowIso()))
      .limit(1);
    const { shiftHours } = await getSettings();
    res.json(toMetricsPayload(row!, shiftHours));
  } catch (err) {
    if (err instanceof MoizvonkiAuthError) {
      res.status(401).json({ error: "auth_failed", message: err.message });
      return;
    }
    if (err instanceof MoizvonkiUnavailableError || err instanceof MoizvonkiParseError) {
      const notConfigured = err.message.includes("Подключение не настроено");
      res.status(notConfigured ? 400 : 502).json({
        error: notConfigured ? "not_configured" : "collection_failed",
        message: err.message,
      });
      return;
    }
    req.log.error({ err }, "Failed to refresh Мои Звонки metrics");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/upload-csv", async (req, res): Promise<void> => {
  const { csv, date } = req.body ?? {};
  if (typeof csv !== "string" || !csv.trim()) {
    res.status(400).json({ error: "csv is required" });
    return;
  }
  let dateIso = todayMoscowIso();
  if (typeof date === "string" && date.trim()) {
    const parsed = displayToIso(date);
    if (!parsed) {
      res.status(400).json({ error: "date must be DD.MM.YYYY" });
      return;
    }
    dateIso = parsed;
  }
  try {
    const metrics = parseMoizvonkiCsv(csv);
    await storeMetrics(dateIso, metrics, "csv");
    const [row] = await db.select().from(moizvonkiMetrics).where(eq(moizvonkiMetrics.date, dateIso)).limit(1);
    const { shiftHours } = await getSettings();
    res.json(toMetricsPayload(row!, shiftHours));
  } catch (err) {
    if (err instanceof MoizvonkiCsvError) {
      res.status(400).json({ error: "csv_parse_failed", message: err.message });
      return;
    }
    req.log.error({ err }, "Failed to upload Мои Звонки CSV");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/history", async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(moizvonkiMetrics)
      .orderBy(desc(moizvonkiMetrics.date))
      .limit(30);
    const { shiftHours } = await getSettings();
    res.json(
      rows.reverse().map((r) => ({
        date: isoToDisplay(r.date),
        calls: r.calls,
        trafficSeconds: r.trafficSeconds,
        density: shiftHours > 0 ? Math.round((r.calls / shiftHours) * 100) / 100 : 0,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get Мои Звонки history");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/settings", async (_req, res): Promise<void> => {
  res.json(await getSettings());
});

router.put("/settings", async (req, res): Promise<void> => {
  const { shiftHours, refreshIntervalMinutes } = req.body ?? {};
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (shiftHours !== undefined) {
    const n = Number(shiftHours);
    if (!Number.isFinite(n) || n < 0.5 || n > 24) {
      res.status(400).json({ error: "shiftHours must be between 0.5 and 24" });
      return;
    }
    set.shiftHours = n;
  }
  if (refreshIntervalMinutes !== undefined) {
    const n = Number(refreshIntervalMinutes);
    if (!Number.isInteger(n) || n < 1 || n > 240) {
      res.status(400).json({ error: "refreshIntervalMinutes must be an integer between 1 and 240" });
      return;
    }
    set.refreshIntervalMinutes = n;
  }
  try {
    const current = await getSettings();
    await db
      .insert(moizvonkiSettings)
      .values({ id: SETTINGS_ID, ...current, ...set })
      .onConflictDoUpdate({ target: moizvonkiSettings.id, set });
    res.json(await getSettings());
  } catch (err) {
    req.log.error({ err }, "Failed to save Мои Звонки settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
