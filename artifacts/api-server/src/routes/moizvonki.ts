import { Router } from "express";
import { and, desc, eq, ne } from "drizzle-orm";
import { db, mangoCredentials, moizvonkiConnections, moizvonkiMetrics, moizvonkiSettings, teamMembers } from "@workspace/db";
import { encryptToken } from "../lib/encrypt";
import {
  getMangoKpi,
  getMangoTeamKpi,
  mangoBrowserLogin,
  MangoAuthError,
  MangoKpiUnavailableError,
} from "../lib/mangoKpi";
import {
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
import { ensureTeamMember, requireAuth, requireRole, serializeTeamMember } from "../lib/team";

const router = Router();

// Every dashboard route requires a signed-in Clerk user.
router.use(requireAuth);
// Register the unified profile before any route can create per-user dashboard
// state. This makes the first-admin legacy transfer happen before a personal
// connection, setting, or metrics row can exist through this router.
router.use(async (req: any, res, next) => {
  try {
    req.teamMember = await ensureTeamMember(req.userId);
    next();
  } catch (err) {
    req.log?.error({ err }, "Failed to register dashboard team member");
    res.status(500).json({ error: "Internal server error" });
  }
});

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

// ── Mango (shared connection) ────────────────────────────────────────────────
// The dashboard uses ONE shared Mango connection for the whole team: the KPI
// report by GroupId[] already returns one row per operator, so everyone's
// stats come from a single login. Admin/manager configure it; employees never
// see Mango credentials.

async function getStoredMangoCredential() {
  const [row] = await db
    .select()
    .from(mangoCredentials)
    .orderBy(desc(mangoCredentials.updatedAt))
    .limit(1);
  return row ?? null;
}

function handleMangoError(req: any, res: any, err: unknown, logMessage: string): void {
  if (err instanceof MangoAuthError) {
    res.status(401).json({ error: "auth_failed", message: err.message });
    return;
  }
  if (err instanceof MangoKpiUnavailableError) {
    req.log.warn({ err }, logMessage);
    res.status(502).json({ error: "mango_kpi_unavailable", message: err.message });
    return;
  }
  req.log.error({ err }, logMessage);
  res.status(500).json({ error: "Internal server error" });
}

router.get("/mango/status", async (req, res): Promise<void> => {
  try {
    const credential = await getStoredMangoCredential();
    res.json({ isConnected: Boolean(credential) });
  } catch (err) {
    req.log.error({ err }, "Failed to get Mango status for combined dashboard");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/mango/kpi", async (req: any, res): Promise<void> => {
  try {
    const member = await ensureTeamMember(req.userId);
    if (!member.mangoMemberId) {
      res.status(409).json({ error: "operator_not_claimed", message: "Выберите себя в списке операторов Mango" });
      return;
    }
    const credential = await getStoredMangoCredential();
    if (!credential) {
      res.status(404).json({ error: "credentials_not_configured" });
      return;
    }
    const kpi = await getMangoKpi(credential, {
      userId: credential.userId,
      memberId: member.mangoMemberId,
    });
    res.json(kpi);
  } catch (err) {
    handleMangoError(req, res, err, "Failed to fetch Mango KPI for combined dashboard");
  }
});

router.get("/mango/operators", async (req: any, res): Promise<void> => {
  try {
    const credential = await getStoredMangoCredential();
    if (!credential) {
      res.status(404).json({ error: "credentials_not_configured" });
      return;
    }
    const members = await getMangoTeamKpi(credential, { userId: credential.userId });
    // The employee onboarding directory deliberately contains identifiers and
    // names only — team KPI is confidential and available solely to managers.
    res.json(members.map(({ memberId, memberName }) => ({ memberId, memberName })));
  } catch (err) {
    handleMangoError(req, res, err, "Failed to fetch Mango operator list");
  }
});

router.get("/team/kpi", requireRole("manager", "admin"), async (req: any, res): Promise<void> => {
  try {
    const credential = await getStoredMangoCredential();
    if (!credential) {
      res.status(404).json({ error: "credentials_not_configured" });
      return;
    }
    const members = await getMangoTeamKpi(credential, { userId: credential.userId });
    res.json({
      members,
      totalCalls: members.reduce((s, m) => s + m.calls, 0),
      totalTrafficSeconds: members.reduce((s, m) => s + m.trafficSeconds, 0),
    });
  } catch (err) {
    handleMangoError(req, res, err, "Failed to fetch Mango team KPI");
  }
});

/** Bind the current user to their Mango operator (onboarding choice by name). */
router.post("/me/claim-operator", async (req: any, res): Promise<void> => {
  const { mangoMemberId, mangoMemberName } = req.body ?? {};
  const id = Number(mangoMemberId);
  if (!Number.isInteger(id) || id <= 0 || typeof mangoMemberName !== "string" || !mangoMemberName.trim()) {
    res.status(400).json({ error: "mangoMemberId and mangoMemberName are required" });
    return;
  }
  try {
    await ensureTeamMember(req.userId);
    const credential = await getStoredMangoCredential();
    if (!credential) {
      res.status(404).json({ error: "credentials_not_configured" });
      return;
    }
    // Never trust client-provided names or ids: verify the operator against
    // the current shared Mango report and store Mango's canonical name.
    const operators = await getMangoTeamKpi(credential, { userId: credential.userId });
    const operator = operators.find((entry) => entry.memberId === id);
    if (!operator) {
      res.status(400).json({ error: "unknown_mango_operator", message: "Оператор не найден в текущей группе Mango" });
      return;
    }
    const [ownedByAnotherUser] = await db
      .select({ clerkUserId: teamMembers.clerkUserId })
      .from(teamMembers)
      .where(and(eq(teamMembers.mangoMemberId, id), ne(teamMembers.clerkUserId, req.userId)))
      .limit(1);
    if (ownedByAnotherUser) {
      res.status(409).json({ error: "operator_already_claimed", message: "Этот оператор уже привязан к другому пользователю" });
      return;
    }
    const [row] = await db
      .update(teamMembers)
      .set({ mangoMemberId: id, mangoMemberName: operator.memberName })
      .where(eq(teamMembers.clerkUserId, req.userId))
      .returning();
    res.json(serializeTeamMember(row));
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      res.status(409).json({ error: "operator_already_claimed", message: "Этот оператор уже привязан к другому пользователю" });
      return;
    }
    req.log.error({ err }, "Failed to claim Mango operator");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Only admin/manager may touch the shared Mango connection.
router.put("/mango/credentials", requireRole("manager", "admin"), async (req: any, res): Promise<void> => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  try {
    const existing = await getStoredMangoCredential();
    // Keep updating the existing shared row (whoever created it); only the
    // first configuration creates a new row under the configuring user.
    const userId = existing?.userId ?? req.userId;
    const persist = async (session?: Awaited<ReturnType<typeof mangoBrowserLogin>>) => {
      const base = {
        email: encryptToken(email.trim()),
        password: encryptToken(password),
        updatedAt: new Date(),
      };
      const withTokens = session
        ? { ...base, authToken: encryptToken(session.jwtToken), operatorGroups: JSON.stringify(session.operatorGroups) }
        : base;
      await db
        .insert(mangoCredentials)
        .values({ userId, ...withTokens })
        .onConflictDoUpdate({ target: mangoCredentials.userId, set: withTokens });
    };

    try {
      const session = await mangoBrowserLogin(email.trim(), password);
      await persist(session);
      res.status(204).send();
    } catch (err) {
      await persist().catch((e) => req.log.error({ err: e }, "Failed to persist Mango credentials"));
      if (err instanceof MangoAuthError) {
        res.status(401).json({ error: "auth_failed", message: err.message });
        return;
      }
      if (err instanceof MangoKpiUnavailableError) {
        res.status(502).json({ error: "mango_login_unavailable", message: err.message });
        return;
      }
      throw err;
    }
  } catch (err) {
    req.log.error({ err }, "Failed to store Mango credentials for combined dashboard");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/mango/credentials", requireRole("manager", "admin"), async (req, res): Promise<void> => {
  try {
    const existing = await getStoredMangoCredential();
    if (existing) {
      await db.delete(mangoCredentials).where(eq(mangoCredentials.userId, existing.userId));
    }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete Mango credentials for combined dashboard");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Мои Звонки (per-user) ────────────────────────────────────────────────────
// Each user connects their own ЛК «Мои Звонки» — data is bound to the personal
// account and cannot be aggregated from one connection.

router.get("/status", async (req: any, res): Promise<void> => {
  try {
    const [conn] = await db
      .select()
      .from(moizvonkiConnections)
      .where(eq(moizvonkiConnections.id, req.userId))
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
router.put("/session", async (req: any, res): Promise<void> => {
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
      .values({ id: req.userId, ...set })
      .onConflictDoUpdate({ target: moizvonkiConnections.id, set });
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to store Мои Звонки session");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** Variant B config: login + password for automatic headless sign-in. */
router.put("/credentials", async (req: any, res): Promise<void> => {
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
      .values({ id: req.userId, ...set })
      .onConflictDoUpdate({ target: moizvonkiConnections.id, set });
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to store Мои Звонки credentials");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/credentials", async (req: any, res): Promise<void> => {
  try {
    await db
      .update(moizvonkiConnections)
      .set({ login: null, password: null, cookies: null, reportUrl: null, headers: null, updatedAt: new Date() })
      .where(eq(moizvonkiConnections.id, req.userId));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete Мои Звонки connection");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/metrics", async (req: any, res): Promise<void> => {
  try {
    const [row] = await db
      .select()
      .from(moizvonkiMetrics)
      .where(and(eq(moizvonkiMetrics.userId, req.userId), eq(moizvonkiMetrics.date, todayMoscowIso())))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "no_metrics_today" });
      return;
    }
    const { shiftHours } = await getSettings(req.userId);
    res.json(toMetricsPayload(row, shiftHours));
  } catch (err) {
    req.log.error({ err }, "Failed to get Мои Звонки metrics");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/refresh", async (req: any, res): Promise<void> => {
  try {
    await refreshMoizvonki(req.userId);
    const [row] = await db
      .select()
      .from(moizvonkiMetrics)
      .where(and(eq(moizvonkiMetrics.userId, req.userId), eq(moizvonkiMetrics.date, todayMoscowIso())))
      .limit(1);
    const { shiftHours } = await getSettings(req.userId);
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

router.post("/upload-csv", async (req: any, res): Promise<void> => {
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
    await storeMetrics(req.userId, dateIso, metrics, "csv");
    const [row] = await db
      .select()
      .from(moizvonkiMetrics)
      .where(and(eq(moizvonkiMetrics.userId, req.userId), eq(moizvonkiMetrics.date, dateIso)))
      .limit(1);
    const { shiftHours } = await getSettings(req.userId);
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

router.get("/history", async (req: any, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(moizvonkiMetrics)
      .where(eq(moizvonkiMetrics.userId, req.userId))
      .orderBy(desc(moizvonkiMetrics.date))
      .limit(30);
    const { shiftHours } = await getSettings(req.userId);
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

router.get("/settings", async (req: any, res): Promise<void> => {
  res.json(await getSettings(req.userId));
});

router.put("/settings", async (req: any, res): Promise<void> => {
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
    const current = await getSettings(req.userId);
    await db
      .insert(moizvonkiSettings)
      .values({ id: req.userId, ...current, ...set })
      .onConflictDoUpdate({ target: moizvonkiSettings.id, set });
    res.json(await getSettings(req.userId));
  } catch (err) {
    req.log.error({ err }, "Failed to save Мои Звонки settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
