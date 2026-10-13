import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

import { classroomsTable } from "./classrooms";

export const attendanceSessionsTable = pgTable("attendance_sessions", {
  id: serial("id").primaryKey(),
  classId: integer("class_id")
    .notNull()
    .references(() => classroomsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  qrToken: text("qr_token").notNull().unique(),
  qrExpiresAt: timestamp("qr_expires_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAttendanceSessionSchema = createInsertSchema(
  attendanceSessionsTable,
).omit({ id: true });
export type InsertAttendanceSession = z.infer<
  typeof insertAttendanceSessionSchema
>;
export type AttendanceSession = typeof attendanceSessionsTable.$inferSelect;
