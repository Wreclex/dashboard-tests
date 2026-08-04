/**
 * Flexible metrics extraction for «Мои Звонки» report payloads.
 *
 * The internal report response shape is not documented, so instead of a rigid
 * schema we walk whatever we got (JSON object, JSON string, HTML, plain text)
 * and look for the two numbers we need by Russian/English keyword matching:
 *   - calls          — количество попыток дозвона
 *   - trafficSeconds — суммарное время совершённых звонков
 */

export type RawMetrics = { calls: number; trafficSeconds: number };

export class MoizvonkiParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoizvonkiParseError";
  }
}

const CALLS_KEY =
  /(кол[- ]?во|количество|число|count|total|attempt|попытк|дозвон).*(звонк|вызов|call)|(звонк|вызов|call).*(кол|число|count|всего)|^calls?$|call_count|total_calls|popytok|popytki/i;
const TRAFFIC_KEY =
  /(трафик|traffic|длительност|продолжительност|duration|talk_?time|время\s*разговор|суммарн.*времен|времени\s*всего)/i;

/** "1:23:45" | "45:12" | "1 ч 23 мин 5 сек" | "3600" → seconds, or null. */
export function parseDurationSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;

  // "1 ч 23 мин 5 сек" / "2ч 15м"
  const ru = v.match(
    /^(?:(\d+)\s*(?:ч|час|hours?|h)\s*)?(?:(\d+)\s*(?:мин|min|m)\s*)?(?:(\d+)\s*(?:сек|sec|s)?)?$/i,
  );
  if (ru && (ru[1] || ru[2] || ru[3])) {
    const h = Number(ru[1] ?? 0);
    const m = Number(ru[2] ?? 0);
    const s = Number(ru[3] ?? 0);
    return h * 3600 + m * 60 + s;
  }

  // "HH:MM:SS" or "MM:SS"
  const clock = v.match(/^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (clock) {
    if (clock[3] !== undefined) {
      return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
    }
    return Number(clock[1]) * 60 + Number(clock[2]);
  }

  // Plain number string (seconds)
  if (/^\d+([.,]\d+)?$/.test(v)) {
    return Math.round(Number(v.replace(",", ".")));
  }
  return null;
}

function parseCountValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const v = value.trim().replace(/\s/g, "");
    if (/^\d+$/.test(v)) return Number(v);
  }
  return null;
}

/** Deep-walk a JSON structure looking for keyword-matched keys. */
function walkJson(node: unknown, found: Partial<RawMetrics>): void {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    for (const item of node) walkJson(item, found);
    return;
  }
  if (typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (found.calls === undefined && CALLS_KEY.test(key)) {
        const n = parseCountValue(value);
        if (n !== null) found.calls = n;
      }
      if (found.trafficSeconds === undefined && TRAFFIC_KEY.test(key)) {
        const n = parseDurationSeconds(value);
        if (n !== null) found.trafficSeconds = n;
      }
      if (typeof value === "object" && value !== null) walkJson(value, found);
    }
  }
}

/** Regex fallback for HTML / plain text: «Трафик: 1:23:45», «Кол-во звонков: 42». */
function walkText(text: string, found: Partial<RawMetrics>): void {
  if (found.trafficSeconds === undefined) {
    const m = text.match(
      /(?:трафик|длительность|продолжительность|время\s*разговоров?)[^0-9]{0,20}([0-9]{1,3}:[0-9]{1,2}(?::[0-9]{1,2})?)/i,
    );
    if (m) {
      const n = parseDurationSeconds(m[1]);
      if (n !== null) found.trafficSeconds = n;
    }
  }
  if (found.calls === undefined) {
    const m = text.match(
      /(?:кол[- ]?во|количество|число)\s*(?:звонков|вызовов|попыток|дозвонов)[^0-9]{0,20}(\d+)/i,
    );
    if (m) found.calls = Number(m[1]);
  }
}

/**
 * Extract calls + trafficSeconds from an arbitrary report payload.
 * @throws MoizvonkiParseError when neither JSON-walk nor text-regex finds both numbers.
 */
export function extractMetrics(payload: unknown): RawMetrics {
  const found: Partial<RawMetrics> = {};

  if (typeof payload === "string") {
    try {
      walkJson(JSON.parse(payload), found);
    } catch {
      walkText(payload, found);
    }
  } else {
    walkJson(payload, found);
  }

  if (found.calls === undefined || found.trafficSeconds === undefined) {
    const sample =
      typeof payload === "string"
        ? payload.slice(0, 300)
        : JSON.stringify(payload)?.slice(0, 300) ?? String(payload);
    throw new MoizvonkiParseError(
      `Не удалось найти метрики в ответе (calls=${found.calls ?? "?"}, traffic=${
        found.trafficSeconds ?? "?"
      }). Фрагмент: ${sample}`,
    );
  }
  return { calls: found.calls, trafficSeconds: found.trafficSeconds };
}
