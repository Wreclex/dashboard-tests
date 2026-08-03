import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, mangoCredentials } from "@workspace/db";
import { eq } from "drizzle-orm";
import { PutMangoTokenBody } from "@workspace/api-zod";
import { encryptToken } from "../lib/encrypt";
import { getMangoKpi, MangoKpiUnavailableError, MangoTokenExpiredError } from "../lib/mangoKpi";

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

router.put("/token", requireAuth, async (req: any, res): Promise<void> => {
  const parsed = PutMangoTokenBody.safeParse(req.body);
  const token = parsed.success ? parsed.data.token.replace(/^Bearer\s+/i, "").trim() : "";
  if (!token) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }
  try {
    await db
      .insert(mangoCredentials)
      .values({ userId: req.userId, bearerToken: encryptToken(token), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: mangoCredentials.userId,
        set: { bearerToken: encryptToken(token), updatedAt: new Date() },
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
    const kpi = await getMangoKpi(credential.bearerToken);
    res.json(kpi);
  } catch (err) {
    if (err instanceof MangoTokenExpiredError) {
      res.status(401).json({ error: "token_expired" });
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