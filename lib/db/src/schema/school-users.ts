import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

import { studentsTable } from "./students";

export const schoolUsersTable = pgTable(
  "school_users",
  {
    id: serial("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    email: text("email").notNull().default(""),
    displayName: text("display_name").notNull().default("Tài khoản mới"),
    role: text("role").notNull().default("pending"),
    studentId: integer("student_id").references(() => studentsTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("school_users_student_id_unique").on(table.studentId)],
);

export const insertSchoolUserSchema = createInsertSchema(schoolUsersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSchoolUser = z.infer<typeof insertSchoolUserSchema>;
export type SchoolUser = typeof schoolUsersTable.$inferSelect;
