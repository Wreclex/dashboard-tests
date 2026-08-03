import { Router } from "express";
import { getAuth } from "@clerk/express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "../lib/logger";

const router = Router();

// Column indices (0-based) in the spreadsheet
// AC=28, AD=29, AE=30, AF=31, AG=32
const COL = {
  pzm: 28,   // AC — ДАТА совершенного ПЗМ
  pstl: 29,  // AD — ДАТА совершенного ВЗМ  → ПСТЛ in the app
  psm: 30,   // AE — ДАТА совершенного ПСМ
  vstl: 31,  // AF — ДАТА совершенного ВСМ  → ВСТЛ in the app
  dozh: 32,  // AG — ДАТА ПЕРВОГО ПЛАТЕЖА   → ДОЖ in the app
};

const SPREADSHEET_ID = "1J4db2S0XJgEHLxQMpO2ey7GbhWFkySFDVj9ZCUXK4ko";

/** Format a Date as DD.MM.YYYY (the format used in the sheet) */
function formatSheetDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// GET /api/sheets/counts
router.get("/counts", requireAuth, async (req: any, res) => {
  const today = formatSheetDate(new Date());

  try {
    const connectors = new ReplitConnectors();

    // Fetch all data rows — skip header rows 1-2, read from row 3 onward
    // Columns A through AG (index 0-32) — wide enough to include all date cols
    const range = encodeURIComponent(`ВОРОНКА!A3:AG`);
    const sheetsRes = await connectors.proxy(
      "google-sheet",
      `/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`,
    );

    if (!sheetsRes.ok) {
      const errBody = await sheetsRes.text();
      req.log.warn({ status: sheetsRes.status, body: errBody }, "Sheets API error");
      return res.status(502).json({ error: "Google Sheets API error" });
    }

    const data = (await sheetsRes.json()) as { values?: string[][] };
    const rows = data.values ?? [];

    let pzm = 0, psm = 0, pstl = 0, vstl = 0, dozh = 0;

    for (const row of rows) {
      if ((row[COL.pzm] ?? "").trim() === today) pzm++;
      if ((row[COL.psm] ?? "").trim() === today) psm++;
      if ((row[COL.pstl] ?? "").trim() === today) pstl++;
      if ((row[COL.vstl] ?? "").trim() === today) vstl++;
      if ((row[COL.dozh] ?? "").trim() === today) dozh++;
    }

    req.log.info({ today, pzm, psm, pstl, vstl, dozh, rows: rows.length }, "Sheet counts");
    return res.json({ pzm, psm, pstl, vstl, dozh, date: today });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch sheet counts");
    return res.status(502).json({ error: "Failed to fetch spreadsheet data" });
  }
});

export default router;
