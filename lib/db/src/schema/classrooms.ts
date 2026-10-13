import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const classroomsTable = pgTable("classrooms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  room: text("room").notNull(),
});

export const insertClassroomSchema = createInsertSchema(classroomsTable).omit({
  id: true,
});
export type InsertClassroom = z.infer<typeof insertClassroomSchema>;
export type Classroom = typeof classroomsTable.$inferSelect;
