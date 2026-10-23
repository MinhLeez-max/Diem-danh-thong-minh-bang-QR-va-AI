import { randomUUID } from "node:crypto";
import { db, lockResource } from "@workspace/db";
import { HttpError } from "../lib/http-error";

export const QR_TTL_MS = 45_000;

export async function openSession(classId: number) {
  return db.transaction().execute(async (tx) => {
    await lockResource(tx, `class-session:${classId}`);
    const existing = await tx
      .selectFrom("attendanceSessions")
      .selectAll()
      .where("classId", "=", classId)
      .where("status", "=", "active")
      .executeTakeFirst();
    if (existing) return existing;
    return tx
      .insertInto("attendanceSessions")
      .values({
        classId,
        status: "active",
        qrToken: randomUUID(),
        qrExpiresAt: new Date(Date.now() + QR_TTL_MS),
      })
      .outputAll("inserted")
      .executeTakeFirstOrThrow();
  });
}

export async function closeSession(sessionId: number) {
  return db.transaction().execute(async (tx) => {
    await lockResource(tx, `attendance-session:${sessionId}`);
    const session = await tx
      .selectFrom("attendanceSessions")
      .selectAll()
      .where("id", "=", sessionId)
      .executeTakeFirst();
    if (!session) throw new HttpError(404, "Không tìm thấy buổi điểm danh.");
    if (session.status === "closed") return session;
    const students = await tx
      .selectFrom("students")
      .select("id")
      .where("classId", "=", session.classId)
      .execute();
    const records = await tx
      .selectFrom("attendanceRecords")
      .select("studentId")
      .where("sessionId", "=", sessionId)
      .execute();
    const recorded = new Set(records.map((record) => record.studentId));
    // Insert individually to avoid SQL Server's 2100-parameter batch limit.
    for (const student of students) {
      if (!recorded.has(student.id))
        await tx
          .insertInto("attendanceRecords")
          .values({ sessionId, studentId: student.id, status: "absent" })
          .execute();
    }
    return tx
      .updateTable("attendanceSessions")
      .set({ status: "closed", endedAt: new Date() })
      .where("id", "=", sessionId)
      .outputAll("inserted")
      .executeTakeFirstOrThrow();
  });
}

export async function recordCheckIn(
  sessionId: number,
  studentId: number,
  qrToken: string,
) {
  return db.transaction().execute(async (tx) => {
    await lockResource(tx, `attendance-session:${sessionId}`);
    const session = await tx
      .selectFrom("attendanceSessions")
      .selectAll()
      .where("id", "=", sessionId)
      .executeTakeFirst();
    if (
      !session ||
      session.status !== "active" ||
      session.qrToken !== qrToken ||
      session.qrExpiresAt.getTime() <= Date.now()
    ) {
      throw new HttpError(400, "Mã QR đã hết hạn hoặc buổi điểm danh đã đóng.");
    }
    const student = await tx
      .selectFrom("students")
      .selectAll()
      .where("id", "=", studentId)
      .executeTakeFirst();
    if (!student || student.classId !== session.classId)
      throw new HttpError(403, "Học sinh không thuộc lớp của buổi điểm danh.");
    const existing = await tx
      .selectFrom("attendanceRecords")
      .selectAll()
      .where("sessionId", "=", sessionId)
      .where("studentId", "=", studentId)
      .executeTakeFirst();
    if (existing) return { record: existing, duplicate: true };
    const now = new Date();
    const record = await tx
      .insertInto("attendanceRecords")
      .values({
        sessionId,
        studentId,
        status: "present",
        checkedInAt: now,
        updatedAt: now,
      })
      .outputAll("inserted")
      .executeTakeFirstOrThrow();
    return { record, duplicate: false };
  });
}

export async function saveCountSnapshot(sessionId: number, input: { estimatedCount: number; confidence: number; source: string }) {
  return db.transaction().execute(async tx => {
    await lockResource(tx, `attendance-session:${sessionId}`);
    const session = await tx.selectFrom('attendanceSessions').selectAll().where('id', '=', sessionId).executeTakeFirst();
    if (!session) throw new HttpError(404, 'Không tìm thấy buổi điểm danh.');
    if (session.status !== 'active') throw new HttpError(400, 'Không thể lưu số đếm cho buổi điểm danh đã đóng.');
    return tx.insertInto('countSnapshots').values({ sessionId, ...input }).outputAll('inserted').executeTakeFirstOrThrow();
  });
}
