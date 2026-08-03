import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, mangoCredentials } from "@workspace/db";
import { eq } from "drizzle-orm";
import { encryptToken } from "../lib/encrypt";
import { getMangoKpi, MangoKpiUnavailableError, MangoAuthError } from "../lib/mangoKpi";

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
      .select({ userId: mangoCredentials.userId })
      .from(mangoCredentials)
      .where(eq(mangoCredentials.userId, req.userId))
      .limit(1);
    res.json({ isConnected: Boolean(credential) });
  } catch (err) {
    req.log.error({ err }, "Failed to get Mango Office status");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** Store auth_token + optional refresh_token obtained from the Mango CCC localStorage bookmarklet. */
router.put("/token", requireAuth, async (req: any, res): Promise<void> => {
  const { token, refresh } = req.body ?? {};
  if (typeof token !== "string" || !token.trim()) {
    res.status(400).json({ error: "token is required" });
    return;
  }
  // Normalize: localStorage values are often JSON-stringified ("\"abc\"") and
  // users sometimes paste with a "Bearer " prefix — strip both.
  const normalize = (raw: string): string =>
    raw.trim().replace(/^"+|"+$/g, "").replace(/^Bearer\s+/i, "").trim();
  const authToken = normalize(token);
  const refreshToken =
    typeof refresh === "string" && normalize(refresh) ? normalize(refresh) : authToken;
  if (!authToken) {
    res.status(400).json({ error: "token is required" });
    return;
  }

  try {
    await db
      .insert(mangoCredentials)
      .values({
        userId: req.userId,
        authToken: encryptToken(authToken),
        refreshToken: encryptToken(refreshToken),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: mangoCredentials.userId,
        set: {
          authToken: encryptToken(authToken),
          refreshToken: encryptToken(refreshToken),
          updatedAt: new Date(),
        },
      });
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to store Mango Office token");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/token", requireAuth, async (req: any, res): Promise<void> => {
  try {
    await db.delete(mangoCredentials).where(eq(mangoCredentials.userId, req.userId));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete Mango Office token");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/kpi", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const [credential] = await db
      .select()
      .from(mangoCredentials)
      .where(eq(mangoCredentials.userId, req.userId))
      .limit(1);
    if (!credential) {
      res.status(404).json({ error: "token_not_configured" });
      return;
    }
    const kpi = await getMangoKpi(credential.authToken, credential.refreshToken, {
      userId: req.userId,
    });
    res.json(kpi);
  } catch (err) {
    if (err instanceof MangoAuthError) {
      res.status(401).json({ error: "token_expired", message: err.message });
      return;
    }
    if (err instanceof MangoKpiUnavailableError) {
      req.log.warn({ err }, "Mango Office KPI unavailable");
      res.status(502).json({ error: "mango_kpi_unavailable" });
      return;
    }
    req.log.error({ err }, "Failed to fetch Mango Office KPI");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
