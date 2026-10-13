import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

import { attendanceSessionsTable } from "./attendance-sessions";
import { studentsTable } from "./students";

export const attendanceRecordsTable = pgTable(
  "attendance_records",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => attendanceSessionsTable.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("present"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    note: text("note"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("attendance_session_student_unique").on(
      table.sessionId,
      table.studentId,
    ),
  ],
);

export const insertAttendanceRecordSchema = createInsertSchema(
  attendanceRecordsTable,
).omit({ id: true, updatedAt: true });
export type InsertAttendanceRecord = z.infer<
  typeof insertAttendanceRecordSchema
>;
export type AttendanceRecord = typeof attendanceRecordsTable.$inferSelect;
