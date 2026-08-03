import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const mangoCredentials = pgTable(
  "mango_credentials",
  {
    userId: text("user_id").primaryKey(),
    bearerToken: text("bearer_token").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("mango_credentials_user_id_idx").on(table.userId)],
);

export const insertMangoCredentialsSchema = createInsertSchema(mangoCredentials).omit({
  updatedAt: true,
});

export type InsertMangoCredentials = z.infer<typeof insertMangoCredentialsSchema>;
export type MangoCredentials = typeof mangoCredentials.$inferSelect;