import { pgTable, text, timestamp, integer, real, primaryKey } from "drizzle-orm/pg-core";

/**
 * Per-user connection config for the «Мои Звонки» dashboard — the row id is
 * the owner's Clerk user id (the legacy single-user row used id "default" and
 * is claimed by the first admin on registration).
 *
 * Two collection paths, mirroring the Mango two-tier approach:
 *  - Variant A: replay of the internal report HTTP request (cookies + URL
 *    copied from the user's browser DevTools), stored encrypted.
 *  - Variant B: headless-browser login with login + password, stored encrypted.
 * On a successful browser run we also harvest the session cookies + the data
 * request URL back into this row so subsequent runs can use the fast path.
 */
export const moizvonkiConnections = pgTable("moizvonki_connections", {
  id: text("id").primaryKey(),
  /** Encrypted ЛК login (Variant B). */
  login: text("login"),
  /** Encrypted ЛК password (Variant B). */
  password: text("password"),
  /** Encrypted Cookie header value (Variant A). */
  cookies: text("cookies"),
  /** Internal report request URL copied from DevTools (Variant A). */
  reportUrl: text("report_url"),
  /** Encrypted optional extra headers as a JSON object string (Variant A). */
  headers: text("headers"),
  lastFetchAt: timestamp("last_fetch_at", { withTimezone: true }),
  lastError: text("last_error"),
  /** "http" | "browser" | "csv" — how the last successful point was collected. */
  lastSource: text("last_source"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MoizvonkiConnection = typeof moizvonkiConnections.$inferSelect;

/**
 * One metrics point per user per day. date is ISO YYYY-MM-DD (sortable).
 * userId is the owner's Clerk user id (legacy rows carry "default" until the
 * first admin claims them).
 */
export const moizvonkiMetrics = pgTable(
  "moizvonki_metrics",
  {
    userId: text("user_id").notNull().default("default"),
    date: text("date").notNull(),
    calls: integer("calls").notNull(),
    trafficSeconds: integer("traffic_seconds").notNull(),
    /** "http" | "browser" | "csv" */
    source: text("source").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.date] })],
);

export type MoizvonkiMetric = typeof moizvonkiMetrics.$inferSelect;

/** Per-user dashboard settings (row id = Clerk user id; shift duration for density, refresh interval). */
export const moizvonkiSettings = pgTable("moizvonki_settings", {
  id: text("id").primaryKey(),
  shiftHours: real("shift_hours").notNull().default(9.5),
  refreshIntervalMinutes: integer("refresh_interval_minutes").notNull().default(15),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MoizvonkiSettings = typeof moizvonkiSettings.$inferSelect;
