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

router.put("/token", requireAuth, async (req: any, res): Promise<void> => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || !email.trim() ||
      typeof password !== "string" || !password.trim()) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }
  try {
    await db
      .insert(mangoCredentials)
      .values({
        userId: req.userId,
        email: encryptToken(email.trim()),
        password: encryptToken(password.trim()),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: mangoCredentials.userId,
        set: {
          email: encryptToken(email.trim()),
          password: encryptToken(password.trim()),
          updatedAt: new Date(),
        },
      });
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to store Mango Office credentials");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/token", requireAuth, async (req: any, res): Promise<void> => {
  try {
    await db.delete(mangoCredentials).where(eq(mangoCredentials.userId, req.userId));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete Mango Office credentials");
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
    const kpi = await getMangoKpi(credential.email, credential.password);
    res.json(kpi);
  } catch (err) {
    if (err instanceof MangoAuthError) {
      res.status(401).json({ error: "auth_failed", message: err.message });
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
