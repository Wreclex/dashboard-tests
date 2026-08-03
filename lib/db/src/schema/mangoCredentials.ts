import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Stores Mango Office CCC credentials + cached session tokens per user.
 *
 * The server logs into ccc.mango-office.ru via a headless browser using the
 * encrypted email + password, then caches the resulting auth/refresh tokens.
 * When the cached tokens expire, it re-logs-in automatically.
 */
export const mangoCredentials = pgTable(
  "mango_credentials",
  {
    userId: text("user_id").primaryKey(),
    /** Encrypted Mango account email (login). */
    email: text("email").notNull(),
    /** Encrypted Mango account password. */
    password: text("password").notNull(),
    /** Encrypted cached auth_token (Bearer for api2.mangotele.com); null until first login. */
    authToken: text("auth_token"),
    /** Encrypted cached refresh_token; null until first login. */
    refreshToken: text("refresh_token"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("mango_credentials_user_id_idx").on(table.userId)],
);

export type MangoCredentials = typeof mangoCredentials.$inferSelect;
