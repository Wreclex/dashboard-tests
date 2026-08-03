import { ReplitConnectors } from "@replit/connectors-sdk";

const SPREADSHEET_ID = "1J4db2S0XJgEHLxQMpO2ey7GbhWFkySFDVj9ZCUXK4ko";
const COL = { manager: 10, pzm: 28, pstl: 29, psm: 30, vstl: 31, dozh: 32 };

export interface SheetCounts {
  pzm: number;
  psm: number;
  pstl: number;
  vstl: number;
  dozh: number;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-zа-яё0-9]/gi, "");
}

export function formatSheetDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.day}.${values.month}.${values.year}`;
}

export async function getTodaySheetCounts(
  managerName?: string,
): Promise<SheetCounts> {
  const today = formatSheetDate(new Date());
  const filter = managerName ? normalizeName(managerName) : "";
  const connectors = new ReplitConnectors();
  const range = encodeURIComponent("ВОРОНКА!A3:AG");
  const response = await Promise.race([
    connectors.proxy("google-sheet", `/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Google Sheets request timed out")), 90_000);
    }),
  ]);

  if (!response.ok) {
    throw new Error(`Google Sheets returned ${response.status}`);
  }

  const data = (await response.json()) as { values?: string[][] };
  const counts: SheetCounts = { pzm: 0, psm: 0, pstl: 0, vstl: 0, dozh: 0 };
  for (const row of data.values ?? []) {
    const manager = normalizeName(row[COL.manager] ?? "");
    if (filter && !manager.includes(filter) && !filter.includes(manager)) continue;
    if ((row[COL.pzm] ?? "").trim() === today) counts.pzm++;
    if ((row[COL.psm] ?? "").trim() === today) counts.psm++;
    if ((row[COL.pstl] ?? "").trim() === today) counts.pstl++;
    if ((row[COL.vstl] ?? "").trim() === today) counts.vstl++;
    if ((row[COL.dozh] ?? "").trim() === today) counts.dozh++;
  }
  return counts;
}