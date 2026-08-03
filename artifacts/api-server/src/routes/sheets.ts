import { Router } from "express";
import { getAuth } from "@clerk/express";
import { formatSheetDate, getTodaySheetCounts } from "../lib/sheetCounts";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// GET /api/sheets/counts?name=АсланАкперов
router.get("/counts", requireAuth, async (req: any, res) => {
  const today = formatSheetDate(new Date());
  const rawName = typeof req.query.name === "string" ? req.query.name.trim() : "";

  try {
    const counts = await getTodaySheetCounts(rawName);
    req.log.info({ today, filter: rawName || "(all)", ...counts }, "Sheet counts");
    return res.json({ ...counts, date: today });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch sheet counts");
    return res.status(502).json({ error: "Failed to fetch spreadsheet data" });
  }
});

export default router;
