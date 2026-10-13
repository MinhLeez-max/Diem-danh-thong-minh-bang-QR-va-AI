import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

import { classroomsTable } from "./classrooms";

export const studentsTable = pgTable("students", {
  id: serial("id").primaryKey(),
  classId: integer("class_id")
    .notNull()
    .references(() => classroomsTable.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  studentCode: text("student_code").notNull().unique(),
});

export const insertStudentSchema = createInsertSchema(studentsTable).omit({
  id: true,
});
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type Student = typeof studentsTable.$inferSelect;
