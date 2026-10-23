import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateQrStudentCheckInParams,
  CreateQrStudentCheckInResponse,
  GetQrCheckInSessionParams,
  GetQrCheckInSessionResponse,
} from "@workspace/api-zod";
import {
  attendanceRecordsTable,
  attendanceSessionsTable,
  classroomsTable,
  db,
  studentsTable,
} from "@workspace/db";
import {
  currentSchoolUser,
  requireRole,
} from "../middlewares/schoolAuth";

const router: IRouter = Router();
router.use("/qr", requireRole("student"));

async function getActiveQrSession(token: string) {
  const [joined] = await db
    .select({
      session: attendanceSessionsTable,
      classroom: classroomsTable,
    })
    .from(attendanceSessionsTable)
    .innerJoin(
      classroomsTable,
      eq(attendanceSessionsTable.classId, classroomsTable.id),
    )
    .where(eq(attendanceSessionsTable.qrToken, token))
    .limit(1);
  if (
    !joined ||
    joined.session.status !== "active" ||
    joined.session.qrExpiresAt.getTime() <= Date.now()
  ) {
    return null;
  }
  return joined;
}

async function attendancePayload(
  record: typeof attendanceRecordsTable.$inferSelect,
  student: typeof studentsTable.$inferSelect,
) {
  return {
    id: record.id,
    sessionId: record.sessionId,
    studentId: record.studentId,
    studentName: student.fullName,
    studentCode: student.studentCode,
    status: record.status,
    checkedInAt: record.checkedInAt,
    updatedAt: record.updatedAt,
  };
}

router.get("/qr/:token", async (req, res): Promise<void> => {
  const params = GetQrCheckInSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const joined = await getActiveQrSession(params.data.token);
  if (!joined) {
    res.status(404).json({
      error: "Mã QR đã hết hạn hoặc buổi điểm danh đã đóng.",
    });
    return;
  }
  res.json(
    GetQrCheckInSessionResponse.parse({
      sessionId: joined.session.id,
      className: joined.classroom.name,
      subject: joined.classroom.subject,
      qrExpiresAt: joined.session.qrExpiresAt,
    }),
  );
});

router.post("/qr/:token/check-in", async (req, res): Promise<void> => {
  const params = CreateQrStudentCheckInParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const user = currentSchoolUser(res);
  if (!user.studentId) {
    res.status(400).json({
      error: "Tài khoản chưa được liên kết với hồ sơ học sinh.",
    });
    return;
  }

  const joined = await getActiveQrSession(params.data.token);
  if (!joined) {
    res.status(400).json({
      error: "Mã QR đã hết hạn hoặc buổi điểm danh đã đóng.",
    });
    return;
  }
  const [student] = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.id, user.studentId))
    .limit(1);
  if (!student) {
    res.status(400).json({ error: "Hồ sơ học sinh đã liên kết không còn tồn tại." });
    return;
  }
  if (student.classId !== joined.session.classId) {
    res.status(403).json({
      error: "Mã QR này không thuộc lớp của hồ sơ học sinh đã liên kết.",
    });
    return;
  }

  const [existing] = await db
    .select()
    .from(attendanceRecordsTable)
    .where(
      and(
        eq(attendanceRecordsTable.sessionId, joined.session.id),
        eq(attendanceRecordsTable.studentId, student.id),
      ),
    )
    .limit(1);
  if (existing) {
    res.status(409).json(
      CreateQrStudentCheckInResponse.parse(
        await attendancePayload(existing, student),
      ),
    );
    return;
  }

  const now = new Date();
  try {
    const [record] = await db
      .insert(attendanceRecordsTable)
      .values({
        sessionId: joined.session.id,
        studentId: student.id,
        status: "present",
        checkedInAt: now,
        updatedAt: now,
      })
      .returning();
    res.status(201).json(
      CreateQrStudentCheckInResponse.parse(
        await attendancePayload(record, student),
      ),
    );
  } catch (error) {
    // The unique session/student index is the final guard against double scans.
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    if (code === "23505") {
      const [record] = await db
        .select()
        .from(attendanceRecordsTable)
        .where(
          and(
            eq(attendanceRecordsTable.sessionId, joined.session.id),
            eq(attendanceRecordsTable.studentId, student.id),
          ),
        )
        .limit(1);
      if (record) {
        res.status(409).json(
          CreateQrStudentCheckInResponse.parse(
            await attendancePayload(record, student),
          ),
        );
        return;
      }
    }
    throw error;
  }
});

export default router;
