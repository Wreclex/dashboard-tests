import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Last successful Mango KPI reads, so the dashboard can render immediately
 * instead of waiting on the (slow, sometimes minute-long) Mango round trip.
 *
 * `key` identifies the report scope:
 *   - "team"          — every operator of the shared connection
 *   - "member:<id>"   — one operator's own numbers
 *
 * `payload` is the JSON-encoded snapshot for that scope. Rows are refreshed in
 * the background; `fetchedAt` tells the UI how old the numbers are.
 */
export const mangoKpiSnapshots = pgTable("mango_kpi_snapshots", {
  key: text("key").primaryKey(),
  payload: text("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MangoKpiSnapshot = typeof mangoKpiSnapshots.$inferSelect;
