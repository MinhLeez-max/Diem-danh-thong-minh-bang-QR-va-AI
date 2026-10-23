import { Router, type IRouter } from "express";
import {
  CreateQrStudentCheckInParams,
  CreateQrStudentCheckInResponse,
  GetQrCheckInSessionParams,
  GetQrCheckInSessionResponse,
  GetStudentAttendanceResponse,
} from "@workspace/api-zod";
import { db, type AttendanceRecord, type Student } from "@workspace/db";
import { currentSchoolUser, requireRole } from "../middlewares/schoolAuth";

import { recordCheckIn } from "../services/attendance";

const router: IRouter = Router();
router.use("/qr", requireRole("student"));

async function getActiveQrSession(token: string) {
  const session = await db
    .selectFrom("attendanceSessions")
    .selectAll()
    .where("qrToken", "=", token)
    .executeTakeFirst();
  if (
    !session ||
    session.status !== "active" ||
    session.qrExpiresAt.getTime() <= Date.now()
  )
    return null;
  const classroom = await db
    .selectFrom("classrooms")
    .selectAll()
    .where("id", "=", session.classId)
    .executeTakeFirstOrThrow();
  return { session, classroom };
}

async function attendancePayload(record: AttendanceRecord, student: Student) {
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

router.get("/student/attendance", requireRole("student"), async (_req, res) => {
  const user = currentSchoolUser(res);
  if (!user.studentId) {
    res.json([]);
    return;
  }
  const history = await db
    .selectFrom("attendanceRecords")
    .innerJoin(
      "attendanceSessions",
      "attendanceRecords.sessionId",
      "attendanceSessions.id",
    )
    .innerJoin("classrooms", "attendanceSessions.classId", "classrooms.id")
    .where("attendanceRecords.studentId", "=", user.studentId)
    .select([
      "attendanceRecords.id",
      "attendanceRecords.sessionId",
      "classrooms.name as className",
      "classrooms.subject",
      "attendanceSessions.startedAt",
      "attendanceRecords.status",
      "attendanceRecords.checkedInAt",
    ])
    .orderBy("attendanceSessions.startedAt", "desc")
    .orderBy("attendanceRecords.id", "desc")
    .top(100)
    .execute();
  res.json(GetStudentAttendanceResponse.parse(history));
});

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
    .selectFrom("students")
    .where((eb) => eb("students.id", "=", user.studentId))
    .top(1)
    .selectAll()
    .execute();
  if (!student) {
    res
      .status(400)
      .json({ error: "Hồ sơ học sinh đã liên kết không còn tồn tại." });
    return;
  }
  if (student.classId !== joined.session.classId) {
    res.status(403).json({
      error: "Mã QR này không thuộc lớp của hồ sơ học sinh đã liên kết.",
    });
    return;
  }

  const { record, duplicate } = await recordCheckIn(
    joined.session.id,
    student.id,
    params.data.token,
  );
  res
    .status(duplicate ? 409 : 201)
    .json(
      CreateQrStudentCheckInResponse.parse(
        await attendancePayload(record, student),
      ),
    );
});

export default router;
