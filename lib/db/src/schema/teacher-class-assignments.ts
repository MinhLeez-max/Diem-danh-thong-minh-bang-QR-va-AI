import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  pgTable,
  serial,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

import { classroomsTable } from "./classrooms";
import { schoolUsersTable } from "./school-users";

export const teacherClassAssignmentsTable = pgTable(
  "teacher_class_assignments",
  {
    id: serial("id").primaryKey(),
    schoolUserId: integer("school_user_id")
      .notNull()
      .references(() => schoolUsersTable.id, { onDelete: "cascade" }),
    classId: integer("class_id")
      .notNull()
      .references(() => classroomsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("teacher_class_assignment_unique").on(
      table.schoolUserId,
      table.classId,
    ),
  ],
);

export const insertTeacherClassAssignmentSchema = createInsertSchema(
  teacherClassAssignmentsTable,
).omit({
  id: true,
  createdAt: true,
});
export type InsertTeacherClassAssignment = z.infer<
  typeof insertTeacherClassAssignmentSchema
>;
export type TeacherClassAssignment =
  typeof teacherClassAssignmentsTable.$inferSelect;
