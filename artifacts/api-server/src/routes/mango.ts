import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, mangoCredentials } from "@workspace/db";
import { eq } from "drizzle-orm";
import { encryptToken } from "../lib/encrypt";
import { mangoBrowserLogin, type MangoBrowserSession } from "../lib/mangoBrowser";
import { MangoKpiUnavailableError, MangoAuthError, parseOperatorGroups } from "../lib/mangoKpi";
import {
  clearUserMangoSnapshot,
  ensureUserMangoSnapshot,
  isUserMangoRefreshRunning,
  readSessionInfo,
  readUserSnapshot,
  refreshUserMangoSnapshot,
} from "../lib/mangoSession";

const router = Router();

function requireAuth(req: any, res: any, next: any): void {
  const userId = getAuth(req)?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = userId;
  next();
}

router.get("/status", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const [credential] = await db
      .select()
      .from(mangoCredentials)
      .where(eq(mangoCredentials.userId, req.userId))
      .limit(1);
    if (!credential) {
      res.json({ isConnected: false, state: "not_configured", message: null, updatedAt: null });
      return;
    }
    const info = readSessionInfo(credential);
    const snapshot = await readUserSnapshot(req.userId);
    res.json({
      isConnected: true,
      state: isUserMangoRefreshRunning(req.userId) ? "refreshing" : info.state,
      message: info.message,
      updatedAt: snapshot?.fetchedAt.toISOString() ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get Mango Office status");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Store Mango account credentials. Before saving, verifies them with a real
 * headless-browser login so the user gets immediate feedback (and the DB is
 * seeded with fresh session tokens). May take up to ~60 seconds.
 */
router.put("/credentials", requireAuth, async (req: any, res): Promise<void> => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  // Save credentials first (encrypted) — even if the verification login fails
  // (e.g. captcha), the KPI flow will retry with them later.
  const persist = async (session?: MangoBrowserSession, failure?: string | null) => {
    const base = {
      email: encryptToken(email.trim()),
      password: encryptToken(password),
      sessionState: session ? "ok" : "reauth_required",
      sessionError: session ? null : (failure ?? null),
      sessionCheckedAt: new Date(),
      updatedAt: new Date(),
    };
    const withTokens = session
      ? {
          ...base,
          authToken: encryptToken(session.jwtToken),
          // Keep any previously stored groups when this login did not
          // republish them — without GroupId[] the KPI report is empty.
          ...(session.operatorGroups.length > 0
            ? { operatorGroups: JSON.stringify(session.operatorGroups) }
            : {}),
        }
      : base;
    await db
      .insert(mangoCredentials)
      .values({ userId: req.userId, ...withTokens })
      .onConflictDoUpdate({ target: mangoCredentials.userId, set: withTokens });
  };

  try {
    const session = await mangoBrowserLogin(email.trim(), password);
    await persist(session);
    // Warm the snapshot with the fresh session so the KPI is ready when the
    // user asks for it.
    const [stored] = await db
      .select()
      .from(mangoCredentials)
      .where(eq(mangoCredentials.userId, req.userId))
      .limit(1);
    if (stored) refreshUserMangoSnapshot(stored);
    res.status(204).send();
  } catch (err) {
    const failure = err instanceof Error ? err.message : null;
    await persist(undefined, failure).catch((e) => req.log.error({ err: e }, "Failed to persist Mango credentials"));
    if (err instanceof MangoAuthError) {
      res.status(401).json({ error: "auth_failed", message: err.message });
      return;
    }
    if (err instanceof MangoKpiUnavailableError) {
      req.log.warn({ err }, "Mango headless login failed");
      res.status(502).json({ error: "mango_login_unavailable", message: err.message });
      return;
    }
    req.log.error({ err }, "Failed to store Mango Office credentials");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Store the RS256 jwt_token (+ operator group IDs) pasted manually from the
 * user's own Mango CCC browser session (localStorage `jwt_token` and
 * `<member_id>.operator_groups`). Works around the single-session
 * enforcement that kicks headless logins out.
 */
router.put("/token", requireAuth, async (req: any, res): Promise<void> => {
  const { token, groups } = req.body ?? {};
  if (typeof token !== "string" || !token.trim()) {
    res.status(400).json({ error: "token is required" });
    return;
  }
  const normalize = (raw: string): string =>
    raw.trim().replace(/^"+|"+$/g, "").replace(/^Bearer\s+/i, "").trim();
  const authToken = normalize(token);
  if (!authToken) {
    res.status(400).json({ error: "token is required" });
    return;
  }
  const operatorGroups = typeof groups === "string" ? parseOperatorGroups(groups) : [];
  if (operatorGroups.length === 0) {
    // GroupId[] is REQUIRED by the KPI report endpoint — a token without
    // groups can never return data, so fail fast instead of storing a
    // credential that silently yields zero rows later.
    res.status(400).json({
      error: "groups_required",
      message: "operator groups are required — paste the full jwt_token||operator_groups string",
    });
    return;
  }

  try {
    const set = {
      authToken: encryptToken(authToken),
      operatorGroups: operatorGroups.length > 0 ? JSON.stringify(operatorGroups) : null,
      sessionState: "ok",
      sessionError: null,
      sessionCheckedAt: new Date(),
      updatedAt: new Date(),
    };
    await db
      .insert(mangoCredentials)
      .values({
        userId: req.userId,
        // email/password are NOT NULL; a token-only row stores empty creds and
        // simply can't use the headless re-login tier until creds are added.
        email: encryptToken(""),
        password: encryptToken(""),
        ...set,
      })
      .onConflictDoUpdate({ target: mangoCredentials.userId, set });
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to store Mango Office token");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/credentials", requireAuth, async (req: any, res): Promise<void> => {
  try {
    await db.delete(mangoCredentials).where(eq(mangoCredentials.userId, req.userId));
    await clearUserMangoSnapshot(req.userId);
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete Mango Office credentials");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Today's Mango KPI for this user's own connection.
 *
 * Answers from the stored snapshot and refreshes Mango in the background, so
 * the request is bounded even when the session expired and a full headless
 * re-login is needed. `state` says what the connection is doing; `hasData`
 * says whether the numbers are real.
 */
router.get("/kpi", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const [credential] = await db
      .select()
      .from(mangoCredentials)
      .where(eq(mangoCredentials.userId, req.userId))
      .limit(1);
    if (!credential) {
      res.json({ state: "not_configured", calls: 0, trafficSeconds: 0, hasData: false, updatedAt: null, message: null });
      return;
    }

    await ensureUserMangoSnapshot(credential);

    // Re-read: the refresh we just awaited may have changed the session state.
    const [latest] = await db
      .select()
      .from(mangoCredentials)
      .where(eq(mangoCredentials.userId, req.userId))
      .limit(1);
    const info = readSessionInfo(latest ?? credential);
    const snapshot = await readUserSnapshot(req.userId);
    res.json({
      state: isUserMangoRefreshRunning(req.userId) ? "refreshing" : info.state,
      calls: snapshot?.data.calls ?? 0,
      trafficSeconds: snapshot?.data.trafficSeconds ?? 0,
      hasData: Boolean(snapshot),
      updatedAt: snapshot?.fetchedAt.toISOString() ?? null,
      message: info.message,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch Mango Office KPI");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
