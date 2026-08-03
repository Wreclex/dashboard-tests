import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Stores the Mango Office CCC session tokens for each user.
 *
 * Column names in the DB are "email" and "password" for historical reasons
 * (originally planned to store credentials). They now hold the encrypted
 * auth_token and refresh_token obtained from the Mango CCC localStorage.
 */
export const mangoCredentials = pgTable(
  "mango_credentials",
  {
    userId: text("user_id").primaryKey(),
    /** Encrypted Mango auth_token (Bearer token for api2.mangotele.com). */
    authToken: text("email").notNull(),
    /** Encrypted Mango refresh_token (for auto-renewal via auth.mango-office.ru/refresh). */
    refreshToken: text("password").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("mango_credentials_user_id_idx").on(table.userId)],
);

export type MangoCredentials = typeof mangoCredentials.$inferSelect;
