import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const mangoCredentials = pgTable(
  "mango_credentials",
  {
    userId: text("user_id").primaryKey(),
    email: text("email").notNull(),
    password: text("password").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("mango_credentials_user_id_idx").on(table.userId)],
);

export type MangoCredentials = typeof mangoCredentials.$inferSelect;
