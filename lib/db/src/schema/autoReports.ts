import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userReportState = pgTable(
  "user_report_state",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    state: jsonb("state").notNull(),
    signature: jsonb("signature").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("user_report_state_user_id_idx").on(table.userId)],
);

export const autoReportSchedules = pgTable(
  "auto_report_schedules",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    channelId: integer("channel_id").notNull(),
    intervalMinutes: integer("interval_minutes").notNull(),
    reportType: integer("report_type").notNull(),
    isActive: boolean("is_active").default(false).notNull(),
    lastSentAt: timestamp("last_sent_at"),
    nextRunAt: timestamp("next_run_at"),
    deliveryLeaseUntil: timestamp("delivery_lease_until"),
    deliveryLeaseToken: text("delivery_lease_token"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("auto_report_schedules_user_id_idx").on(table.userId),
    index("auto_report_schedules_active_idx").on(table.isActive),
  ],
);

export const insertUserReportStateSchema = createInsertSchema(userReportState).omit({
  id: true,
  updatedAt: true,
});

export const insertAutoReportScheduleSchema = createInsertSchema(autoReportSchedules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSentAt: true,
});

export type UserReportState = typeof userReportState.$inferSelect;
export type AutoReportSchedule = typeof autoReportSchedules.$inferSelect;
export type InsertUserReportState = z.infer<typeof insertUserReportStateSchema>;
export type InsertAutoReportSchedule = z.infer<typeof insertAutoReportScheduleSchema>;