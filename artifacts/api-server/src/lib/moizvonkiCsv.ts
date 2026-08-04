/**
 * Manual CSV fallback parser for «Мои Звонки» exports.
 *
 * Two shapes are handled:
 *  1. Per-call export (one row per call): traffic = sum of the duration
 *     column, calls = number of data rows (each row is a dial attempt).
 *  2. Summary export (key;value rows): look for «Трафик» / «Кол-во звонков» rows.
 *
 * Delimiter (; , \t) and duration formats (HH:MM:SS, MM:SS, seconds,
 * "1 ч 23 мин") are detected automatically.
 */

import { parseDurationSeconds, type RawMetrics } from "./moizvonkiParse.ts";

export class MoizvonkiCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoizvonkiCsvError";
  }
}

const DURATION_HEADER = /длительность|продолжительность|время|длина|трафик|duration|talk/i;
const CALLS_HEADER = /кол[- ]?во.*звонк|количество.*звонк|звонков\s*всего|calls|attempts|попытк/i;
const TRAFFIC_ROW = /трафик|длительность|продолжительность|время\s*разговор/i;
const CALLS_ROW = /кол[- ]?во|количество|число|звонк|попытк|дозвон/i;

function detectDelimiter(headerLine: string): string {
  const candidates = [";", ",", "\t", "|"];
  let best = ";";
  let bestCount = 0;
  for (const d of candidates) {
    const count = headerLine.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  // Minimal RFC-4180-ish splitting with quoted-field support.
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Parse a CSV export into { calls, trafficSeconds }.
 * @throws MoizvonkiCsvError when no duration/call data can be located.
 */
export function parseMoizvonkiCsv(csv: string): RawMetrics {
  const lines = csv
    .replace(/^\uFEFF/, "") // strip BOM
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw new MoizvonkiCsvError("CSV-файл пуст");
  }

  const delimiter = detectDelimiter(lines[0]);
  const rows = lines.map((l) => splitCsvLine(l, delimiter));
  const header = rows[0].map((h) => h.toLowerCase());

  // ── Shape 1: per-call table with a header row ─────────────────────────────
  const durationCol = header.findIndex((h) => DURATION_HEADER.test(h));
  const callsCol = header.findIndex((h) => CALLS_HEADER.test(h));
  if (durationCol >= 0 && rows.length > 1) {
    let trafficSeconds = 0;
    let parsedRows = 0;
    let calls = 0;
    for (const row of rows.slice(1)) {
      const seconds = parseDurationSeconds(row[durationCol]);
      if (seconds !== null) {
        trafficSeconds += seconds;
        parsedRows++;
      }
      if (callsCol >= 0) {
        const n = Number((row[callsCol] ?? "").replace(/\s/g, ""));
        if (Number.isFinite(n)) calls += n;
      }
    }
    if (parsedRows === 0) {
      throw new MoizvonkiCsvError(
        `Колонка «${rows[0][durationCol]}» найдена, но ни одно значение не похоже на длительность`,
      );
    }
    // Without an explicit calls column each data row is one dial attempt.
    return { calls: callsCol >= 0 && calls > 0 ? calls : parsedRows, trafficSeconds };
  }

  // ── Shape 2: summary key;value rows ───────────────────────────────────────
  let calls: number | undefined;
  let trafficSeconds: number | undefined;
  for (const row of rows) {
    const label = (row[0] ?? "").toLowerCase();
    const value = row[1] ?? "";
    if (trafficSeconds === undefined && TRAFFIC_ROW.test(label)) {
      const n = parseDurationSeconds(value);
      if (n !== null) trafficSeconds = n;
    }
    if (calls === undefined && CALLS_ROW.test(label) && !TRAFFIC_ROW.test(label)) {
      const n = Number(value.replace(/\s/g, ""));
      if (Number.isFinite(n) && value.trim() !== "") calls = n;
    }
  }
  if (calls !== undefined && trafficSeconds !== undefined) {
    return { calls, trafficSeconds };
  }

  throw new MoizvonkiCsvError(
    "Не удалось распознать структуру CSV: нет ни таблицы с колонкой длительности, ни строк «Трафик» / «Кол-во звонков»",
  );
}
