import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const telegramChannels = pgTable(
  "telegram_channels",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    chatId: text("chat_id").notNull(),
    botToken: text("bot_token").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("telegram_channels_user_id_idx").on(t.userId)],
);

export const insertTelegramChannelSchema = createInsertSchema(telegramChannels).omit({
  id: true,
  createdAt: true,
});

export type InsertTelegramChannel = z.infer<typeof insertTelegramChannelSchema>;
export type TelegramChannel = typeof telegramChannels.$inferSelect;
