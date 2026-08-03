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
    /** Encrypted cached RS256 jwt_token (the token api2.mangotele.com accepts); null until first login. */
    authToken: text("auth_token"),
    /** Legacy column — refresh tokens cannot mint RS256 JWTs, kept for schema compat. */
    refreshToken: text("refresh_token"),
    /** JSON-encoded Mango operator group IDs required by KPI reports (GroupId[]); null until first login. */
    operatorGroups: text("operator_groups"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("mango_credentials_user_id_idx").on(table.userId)],
);

export type MangoCredentials = typeof mangoCredentials.$inferSelect;
