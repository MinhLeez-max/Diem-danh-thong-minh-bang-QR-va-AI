import { createInsertSchema } from "drizzle-zod";
import {
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

import { attendanceSessionsTable } from "./attendance-sessions";

export const countSnapshotsTable = pgTable("count_snapshots", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => attendanceSessionsTable.id, { onDelete: "cascade" }),
  estimatedCount: integer("estimated_count").notNull(),
  confidence: doublePrecision("confidence").notNull(),
  source: text("source").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertCountSnapshotSchema = createInsertSchema(
  countSnapshotsTable,
).omit({ id: true });
export type InsertCountSnapshot = z.infer<typeof insertCountSnapshotSchema>;
export type CountSnapshot = typeof countSnapshotsTable.$inferSelect;
