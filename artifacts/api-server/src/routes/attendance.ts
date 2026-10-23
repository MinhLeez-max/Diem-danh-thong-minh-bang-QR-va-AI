import { trimInput } from "../lib/input";
import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Response } from "express";
import {
  CloseAttendanceSessionParams,
  CloseAttendanceSessionResponse,
  CreateClassBody,
  CreateClassStudentBody,
  CreateClassStudentParams,
  CreateClassStudentResponse,
  CreateClassResponse,
  CreateAttendanceSessionResponse,
  CreateCountSnapshotBody,
  CreateCountSnapshotParams,
  CreateCountSnapshotResponse,
  CreateAttendanceSessionBody,
  CreateSessionCheckInBody,
  CreateSessionCheckInParams,
  CreateSessionCheckInResponse,
  GetAttendanceOverviewResponse,
  GetAttendanceReportQueryParams,
  GetAttendanceReportResponse,
  GetAttendanceSessionParams,
  GetAttendanceSessionResponse,
  GetSessionReconciliationParams,
  GetSessionReconciliationResponse,
  ListAttendanceSessionsQueryParams,
  ListAttendanceSessionsResponse,
  ListClassStudentsParams,
  ListClassStudentsResponse,
  ListClassesResponse,
  ListSessionCheckInsParams,
  ListSessionCheckInsResponse,
  UpdateAttendanceRecordParams,
  UpdateAttendanceRecordBody,
  UpdateAttendanceRecordResponse,
} from "@workspace/api-zod";
import { db, isUniqueViolation, type Classroom } from "@workspace/db";
import {
  accessibleClassIds,
  currentSchoolUser,
  ensureClassAccess,
  requireRole,
} from "../middlewares/schoolAuth";

import {
  openSession,
  closeSession,
  recordCheckIn,
  saveCountSnapshot,
  QR_TTL_MS,
} from "../services/attendance";

const router: IRouter = Router();

const REVIEW_DIFFERENCE = 2;
const REVIEW_CONFIDENCE = 0.65;

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

async function getClassCounts(
  classId: number,
  sessionId: number,
): Promise<{
  studentCount: number;
  checkedInCount: number;
}> {
  const [studentResult] = await db
    .selectFrom("students")
    .where((eb) => eb("students.classId", "=", classId))
    .select((eb) => [eb.fn.countAll<number>().as("value")])
    .execute();
  const [checkInResult] = await db
    .selectFrom("attendanceRecords")
    .where((eb) =>
      eb.and([
        eb("attendanceRecords.sessionId", "=", sessionId),
        eb("attendanceRecords.status", "!=", "absent"),
      ]),
    )
    .select((eb) => [eb.fn.countAll<number>().as("value")])
    .execute();
  return {
    studentCount: Number(studentResult?.value ?? 0),
    checkedInCount: Number(checkInResult?.value ?? 0),
  };
}

async function getSessionPayload(sessionId: number) {
  let session = await db
    .selectFrom("attendanceSessions")
    .selectAll()
    .where("id", "=", sessionId)
    .executeTakeFirst();
  if (!session) return null;
  const classroom = await db
    .selectFrom("classrooms")
    .selectAll()
    .where("id", "=", session.classId)
    .executeTakeFirstOrThrow();
  if (
    session.status === "active" &&
    session.qrExpiresAt.getTime() <= Date.now()
  ) {
    // Only one concurrent reader rotates the expired token. Never rotate a
    // session another request has just closed or refreshed.
    const updated = await db
      .updateTable("attendanceSessions")
      .set({
        qrToken: randomUUID(),
        qrExpiresAt: new Date(Date.now() + QR_TTL_MS),
      })
      .where("id", "=", sessionId)
      .where("status", "=", "active")
      .where("qrToken", "=", session.qrToken)
      .outputAll("inserted")
      .executeTakeFirst();
    session =
      updated ??
      (await db
        .selectFrom("attendanceSessions")
        .selectAll()
        .where("id", "=", sessionId)
        .executeTakeFirstOrThrow());
  }

  const counts = await getClassCounts(session.classId, session.id);
  return {
    id: session.id,
    classId: session.classId,
    className: classroom.name,
    subject: classroom.subject,
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    endedAt: iso(session.endedAt),
    qrToken: session.qrToken,
    qrExpiresAt: session.qrExpiresAt.toISOString(),
    studentCount: counts.studentCount,
    checkedInCount: counts.checkedInCount,
  };
}

async function getClassroomPayload(classroom: Classroom) {
  const [result] = await db
    .selectFrom("students")
    .where((eb) => eb("students.classId", "=", classroom.id))
    .select((eb) => [eb.fn.countAll<number>().as("value")])
    .execute();
  return {
    id: classroom.id,
    name: classroom.name,
    subject: classroom.subject,
    room: classroom.room,
    studentCount: Number(result?.value ?? 0),
  };
}

async function ensureSessionAccess(
  res: Response,
  sessionId: number,
): Promise<boolean> {
  const [session] = await db
    .selectFrom("attendanceSessions")
    .where((eb) => eb("attendanceSessions.id", "=", sessionId))
    .top(1)
    .select(["attendanceSessions.classId as classId"])
    .execute();
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return false;
  }
  return ensureClassAccess(res, session.classId);
}

router.get("/attendance/overview", async (req, res): Promise<void> => {
  const allowedIds = await accessibleClassIds(currentSchoolUser(res));
  const [allClassrooms, allStudents, allSessions, allRecords] =
    await Promise.all([
      db.selectFrom("classrooms").selectAll().execute(),
      db.selectFrom("students").selectAll().execute(),
      db
        .selectFrom("attendanceSessions")
        .orderBy("attendanceSessions.startedAt", "desc")
        .selectAll()
        .execute(),
      db.selectFrom("attendanceRecords").selectAll().execute(),
    ]);

  const allowedSet = allowedIds === null ? null : new Set(allowedIds);
  const classrooms =
    allowedSet === null
      ? allClassrooms
      : allClassrooms.filter((classroom) => allowedSet.has(classroom.id));
  const classIds = new Set(classrooms.map((classroom) => classroom.id));
  const students = allStudents.filter((student) =>
    classIds.has(student.classId),
  );
  const sessions = allSessions.filter((session) =>
    classIds.has(session.classId),
  );
  const sessionIds = new Set(sessions.map((session) => session.id));
  const records = allRecords.filter((record) =>
    sessionIds.has(record.sessionId),
  );
  const recentSessions = sessions.slice(0, 8);
  const sessionPayloads = await Promise.all(
    recentSessions.map((session) => getSessionPayload(session.id)),
  );
  const dayFormat = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayKey = dayFormat.format(new Date());
  const todayCount = sessions.filter(
    (session) => dayFormat.format(session.startedAt) === todayKey,
  ).length;
  const presentCount = records.filter(
    (record) => record.status === "present" || record.status === "late",
  ).length;
  const possibleCount = sessions.reduce((total, session) => {
    return (
      total +
      (session.status === "closed"
        ? records.filter((record) => record.sessionId === session.id).length
        : students.filter((student) => student.classId === session.classId)
            .length)
    );
  }, 0);
  const activities = sessions.slice(0, 4).map((session, index) => {
    const classroom = classrooms.find(
      (candidate) => candidate.id === session.classId,
    );
    return {
      id: session.id,
      message:
        session.status === "active"
          ? `Đang diễn ra điểm danh ${classroom?.name ?? "lớp học"}`
          : `Đã kết thúc điểm danh ${classroom?.name ?? "lớp học"}`,
      createdAt: (index === 0
        ? session.startedAt
        : (session.endedAt ?? session.startedAt)
      ).toISOString(),
    };
  });

  const activeSession =
    sessionPayloads.find((session) => session?.status === "active") ?? null;
  res.json(
    GetAttendanceOverviewResponse.parse({
      classCount: classrooms.length,
      studentCount: students.length,
      sessionsToday: todayCount,
      averageAttendanceRate:
        possibleCount === 0
          ? 0
          : Math.round((presentCount / possibleCount) * 1000) / 10,
      activeSession,
      recentSessions: sessionPayloads.filter(Boolean).slice(0, 5),
      activities,
    }),
  );
});

router.get("/classes", async (_req, res): Promise<void> => {
  const allowedIds = await accessibleClassIds(currentSchoolUser(res));
  const allClassrooms = await db.selectFrom("classrooms").selectAll().execute();
  const classrooms =
    allowedIds === null
      ? allClassrooms
      : allClassrooms.filter((classroom) => allowedIds.includes(classroom.id));
  const payload = await Promise.all(classrooms.map(getClassroomPayload));
  res.json(ListClassesResponse.parse(payload));
});

router.post(
  "/classes",
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const input = CreateClassBody.safeParse(trimInput(req.body));
    if (!input.success) {
      req.log.warn({ errors: input.error.message }, "Invalid class input");
      res.status(400).json({ error: input.error.message });
      return;
    }

    const [classroom] = await db
      .insertInto("classrooms")
      .values(input.data)
      .outputAll("inserted")
      .execute();
    const payload = await getClassroomPayload(classroom);
    res.status(201).json(CreateClassResponse.parse(payload));
  },
);

router.get("/classes/:classId/students", async (req, res): Promise<void> => {
  const params = ListClassStudentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await ensureClassAccess(res, params.data.classId))) {
    return;
  }
  const students = await db
    .selectFrom("students")
    .where((eb) => eb("students.classId", "=", params.data.classId))
    .selectAll()
    .execute();
  const sessions = await db
    .selectFrom("attendanceSessions")
    .where((eb) => eb("attendanceSessions.classId", "=", params.data.classId))
    .selectAll()
    .execute();
  const records = await db
    .selectFrom("attendanceRecords")
    .selectAll()
    .execute();
  const payload = students.map((student) => {
    const studentRecords = records.filter(
      (record) =>
        record.studentId === student.id &&
        sessions.some(
          (session) =>
            session.id === record.sessionId && session.status === "closed",
        ),
    );
    const classSessions = studentRecords.length;
    const attended = studentRecords.filter(
      (record) => record.status !== "absent",
    ).length;
    return {
      id: student.id,
      classId: student.classId,
      fullName: student.fullName,
      studentCode: student.studentCode,
      attendanceRate:
        classSessions === 0
          ? 100
          : Math.round((attended / classSessions) * 1000) / 10,
    };
  });
  res.json(ListClassStudentsResponse.parse(payload));
});

router.post("/classes/:classId/students", async (req, res): Promise<void> => {
  const params = CreateClassStudentParams.safeParse(req.params);
  const input = CreateClassStudentBody.safeParse(trimInput(req.body));
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!input.success) {
    res.status(400).json({ error: input.error.message });
    return;
  }
  if (!(await ensureClassAccess(res, params.data.classId))) {
    return;
  }
  const [classroom] = await db
    .selectFrom("classrooms")
    .where((eb) => eb("classrooms.id", "=", params.data.classId))
    .top(1)
    .select(["classrooms.id as id"])
    .execute();
  if (!classroom) {
    res.status(404).json({ error: "Class not found" });
    return;
  }
  try {
    const [student] = await db
      .insertInto("students")
      .values({
        classId: params.data.classId,
        fullName: input.data.fullName.trim(),
        studentCode: input.data.studentCode.trim(),
      })
      .outputAll("inserted")
      .execute();
    res.status(201).json(
      CreateClassStudentResponse.parse({
        id: student.id,
        classId: student.classId,
        fullName: student.fullName,
        studentCode: student.studentCode,
        attendanceRate: 100,
      }),
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Mã học sinh này đã tồn tại." });
      return;
    }
    throw error;
  }
});

router.get("/sessions", async (req, res): Promise<void> => {
  const query = ListAttendanceSessionsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  if (
    query.data.classId !== undefined &&
    !(await ensureClassAccess(res, query.data.classId))
  ) {
    return;
  }
  const allowedIds = await accessibleClassIds(currentSchoolUser(res));
  if (
    query.data.classId === undefined &&
    allowedIds !== null &&
    !allowedIds.length
  ) {
    res.json(ListAttendanceSessionsResponse.parse([]));
    return;
  }
  const sessions = await db
    .selectFrom("attendanceSessions")
    .where((eb) =>
      query.data.classId !== undefined
        ? eb("attendanceSessions.classId", "=", query.data.classId)
        : allowedIds === null
          ? eb.val(true)
          : eb("attendanceSessions.classId", "in", allowedIds),
    )
    .orderBy("attendanceSessions.startedAt", "desc")
    .selectAll()
    .execute();
  const payload = await Promise.all(
    sessions.map((session) => getSessionPayload(session.id)),
  );
  res.json(ListAttendanceSessionsResponse.parse(payload.filter(Boolean)));
});

router.post("/sessions", async (req, res): Promise<void> => {
  const input = CreateAttendanceSessionBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.message });
    return;
  }
  if (!(await ensureClassAccess(res, input.data.classId))) {
    return;
  }
  const [classroom] = await db
    .selectFrom("classrooms")
    .where((eb) => eb("classrooms.id", "=", input.data.classId))
    .selectAll()
    .execute();
  if (!classroom) {
    res.status(404).json({ error: "Class not found" });
    return;
  }
  const session = await openSession(input.data.classId);
  const payload = await getSessionPayload(session.id);
  res.status(201).json(CreateAttendanceSessionResponse.parse(payload));
});

router.get("/sessions/:sessionId", async (req, res): Promise<void> => {
  const params = GetAttendanceSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await ensureSessionAccess(res, params.data.sessionId))) {
    return;
  }
  const payload = await getSessionPayload(params.data.sessionId);
  if (!payload) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(GetAttendanceSessionResponse.parse(payload));
});

router.post("/sessions/:sessionId/close", async (req, res): Promise<void> => {
  const params = CloseAttendanceSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await ensureSessionAccess(res, params.data.sessionId))) {
    return;
  }
  const updated = await closeSession(params.data.sessionId);
  const payload = await getSessionPayload(updated.id);
  res.json(CloseAttendanceSessionResponse.parse(payload));
});

router.get(
  "/sessions/:sessionId/check-ins",
  async (req, res): Promise<void> => {
    const params = ListSessionCheckInsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!(await ensureSessionAccess(res, params.data.sessionId))) {
      return;
    }
    const records = await db
      .selectFrom("attendanceRecords")
      .innerJoin("students", "attendanceRecords.studentId", "students.id")
      .selectAll("attendanceRecords")
      .select([
        "students.fullName as studentName",
        "students.studentCode as studentCode",
      ])
      .where("attendanceRecords.sessionId", "=", params.data.sessionId)
      .execute();
    const payload = records.map((record) => ({
      id: record.id,
      sessionId: record.sessionId,
      studentId: record.studentId,
      studentName: record.studentName,
      studentCode: record.studentCode,
      status: record.status,
      checkedInAt: iso(record.checkedInAt),
      updatedAt: record.updatedAt.toISOString(),
    }));
    res.json(ListSessionCheckInsResponse.parse(payload));
  },
);

router.post(
  "/sessions/:sessionId/check-ins",
  async (req, res): Promise<void> => {
    const params = CreateSessionCheckInParams.safeParse(req.params);
    const input = CreateSessionCheckInBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!input.success) {
      res.status(400).json({ error: input.error.message });
      return;
    }
    if (!(await ensureSessionAccess(res, params.data.sessionId))) {
      return;
    }
    const [session] = await db
      .selectFrom("attendanceSessions")
      .where((eb) => eb("attendanceSessions.id", "=", params.data.sessionId))
      .selectAll()
      .execute();
    if (
      !session ||
      session.status !== "active" ||
      session.qrToken !== input.data.qrToken ||
      session.qrExpiresAt.getTime() <= Date.now()
    ) {
      res.status(400).json({ error: "QR is invalid, expired, or closed" });
      return;
    }
    const [student] = await db
      .selectFrom("students")
      .where((eb) =>
        eb.and([
          eb("students.studentCode", "=", input.data.studentCode.trim()),
          eb("students.classId", "=", session.classId),
        ]),
      )
      .selectAll()
      .execute();
    if (!student) {
      res.status(400).json({ error: "Student is not in this class" });
      return;
    }
    const { record, duplicate } = await recordCheckIn(
      session.id,
      student.id,
      input.data.qrToken,
    );
    res.status(duplicate ? 409 : 201).json(
      CreateSessionCheckInResponse.parse({
        id: record.id,
        sessionId: record.sessionId,
        studentId: record.studentId,
        studentName: student.fullName,
        studentCode: student.studentCode,
        status: record.status,
        checkedInAt: iso(record.checkedInAt),
        updatedAt: record.updatedAt.toISOString(),
      }),
    );
  },
);

router.patch("/attendance/:recordId", async (req, res): Promise<void> => {
  const params = UpdateAttendanceRecordParams.safeParse(req.params);
  const input = UpdateAttendanceRecordBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!input.success) {
    res.status(400).json({ error: input.error.message });
    return;
  }
  const [existingRecord] = await db
    .selectFrom("attendanceRecords")
    .where((eb) => eb("attendanceRecords.id", "=", params.data.recordId))
    .top(1)
    .selectAll()
    .execute();
  if (!existingRecord) {
    res.status(404).json({ error: "Attendance record not found" });
    return;
  }
  if (!(await ensureSessionAccess(res, existingRecord.sessionId))) {
    return;
  }
  const [updated] = await db
    .updateTable("attendanceRecords")
    .set({
      status: input.data.status,
      note: input.data.note ?? null,
      checkedInAt:
        input.data.status === "absent"
          ? null
          : (existingRecord.checkedInAt ?? new Date()),
      updatedAt: new Date(),
    })
    .where((eb) => eb("attendanceRecords.id", "=", params.data.recordId))
    .outputAll("inserted")
    .execute();
  if (!updated) {
    res.status(404).json({ error: "Attendance record not found" });
    return;
  }
  const [student] = await db
    .selectFrom("students")
    .where((eb) => eb("students.id", "=", updated.studentId))
    .selectAll()
    .execute();
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  res.json(
    UpdateAttendanceRecordResponse.parse({
      id: updated.id,
      sessionId: updated.sessionId,
      studentId: updated.studentId,
      studentName: student.fullName,
      studentCode: student.studentCode,
      status: updated.status,
      checkedInAt: iso(updated.checkedInAt),
      updatedAt: updated.updatedAt.toISOString(),
    }),
  );
});

router.post("/sessions/:sessionId/counts", async (req, res): Promise<void> => {
  const params = CreateCountSnapshotParams.safeParse(req.params);
  const input = CreateCountSnapshotBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!input.success) {
    res.status(400).json({ error: input.error.message });
    return;
  }
  if (!(await ensureSessionAccess(res, params.data.sessionId))) {
    return;
  }
  const snapshot = await saveCountSnapshot(params.data.sessionId, input.data);
  res.status(201).json(
    CreateCountSnapshotResponse.parse({
      id: snapshot.id,
      sessionId: snapshot.sessionId,
      estimatedCount: snapshot.estimatedCount,
      confidence: snapshot.confidence,
      source: snapshot.source,
      capturedAt: snapshot.capturedAt.toISOString(),
    }),
  );
});

router.get(
  "/sessions/:sessionId/reconciliation",
  async (req, res): Promise<void> => {
    const params = GetSessionReconciliationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!(await ensureSessionAccess(res, params.data.sessionId))) {
      return;
    }
    const payload = await getSessionPayload(params.data.sessionId);
    if (!payload) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const [latestSnapshot] = await db
      .selectFrom("countSnapshots")
      .where((eb) => eb("countSnapshots.sessionId", "=", params.data.sessionId))
      .orderBy("countSnapshots.capturedAt", "desc")
      .top(1)
      .selectAll()
      .execute();
    const difference = latestSnapshot
      ? latestSnapshot.estimatedCount - payload.checkedInCount
      : null;
    const needsReview =
      latestSnapshot !== undefined &&
      latestSnapshot.confidence >= REVIEW_CONFIDENCE &&
      Math.abs(difference ?? 0) >= REVIEW_DIFFERENCE;
    const message = !latestSnapshot
      ? "Chưa có số liệu đếm từ camera cho buổi học này."
      : needsReview
        ? "Số lượt QR và số người ước lượng đang chênh lệch. Giáo viên cần kiểm tra thủ công."
        : "Số liệu hiện tại chưa có chênh lệch đáng kể. Kết quả camera chỉ mang tính tham khảo.";
    res.json(
      GetSessionReconciliationResponse.parse({
        sessionId: params.data.sessionId,
        checkedInCount: payload.checkedInCount,
        estimatedCount: latestSnapshot?.estimatedCount ?? null,
        difference,
        confidence: latestSnapshot?.confidence ?? null,
        source: latestSnapshot?.source ?? null,
        capturedAt: iso(latestSnapshot?.capturedAt ?? null),
        needsReview,
        message,
      }),
    );
  },
);

router.get("/reports/attendance", async (req, res): Promise<void> => {
  const query = GetAttendanceReportQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  if (
    query.data.classId !== undefined &&
    !(await ensureClassAccess(res, query.data.classId))
  ) {
    return;
  }
  const allowedIds = await accessibleClassIds(currentSchoolUser(res));
  if (
    query.data.classId === undefined &&
    allowedIds !== null &&
    !allowedIds.length
  ) {
    res.json(
      GetAttendanceReportResponse.parse({
        overallAttendanceRate: 0,
        totalSessions: 0,
        rows: [],
      }),
    );
    return;
  }
  const classes = await db.selectFrom("classrooms").selectAll().execute();
  const selectedClasses =
    query.data.classId === undefined
      ? allowedIds === null
        ? classes
        : classes.filter((classroom) => allowedIds.includes(classroom.id))
      : classes.filter((classroom) => classroom.id === query.data.classId);
  const [students, allSessions, records] = await Promise.all([
    db.selectFrom("students").selectAll().execute(),
    db.selectFrom("attendanceSessions").selectAll().execute(),
    db.selectFrom("attendanceRecords").selectAll().execute(),
  ]);
  const sessions = allSessions.filter((session) => session.status === "closed");
  const rows = selectedClasses.map((classroom) => {
    const classStudents = students.filter(
      (student) => student.classId === classroom.id,
    );
    const classSessions = sessions.filter(
      (session) => session.classId === classroom.id,
    );
    const attended = records.filter(
      (record) =>
        record.status !== "absent" &&
        classSessions.some((session) => session.id === record.sessionId),
    ).length;
    const possible = records.filter((record) =>
      classSessions.some((session) => session.id === record.sessionId),
    ).length;
    return {
      classId: classroom.id,
      className: classroom.name,
      studentCount: classStudents.length,
      attendanceRate:
        possible === 0 ? 0 : Math.round((attended / possible) * 1000) / 10,
      sessionsCount: classSessions.length,
    };
  });
  const selectedClassIds = new Set(
    selectedClasses.map((classroom) => classroom.id),
  );
  const closedSessionIds = new Set(
    sessions
      .filter((session) => selectedClassIds.has(session.classId))
      .map((session) => session.id),
  );
  const totalPossible = records.filter((record) =>
    closedSessionIds.has(record.sessionId),
  ).length;
  const totalAttended = rows.reduce(
    (total, row) =>
      total +
      records.filter(
        (record) =>
          record.status !== "absent" &&
          sessions.some(
            (session) =>
              session.id === record.sessionId &&
              session.classId === row.classId,
          ),
      ).length,
    0,
  );
  res.json(
    GetAttendanceReportResponse.parse({
      overallAttendanceRate:
        totalPossible === 0
          ? 0
          : Math.round((totalAttended / totalPossible) * 1000) / 10,
      totalSessions: rows.reduce((total, row) => total + row.sessionsCount, 0),
      rows,
    }),
  );
});

export default router;
