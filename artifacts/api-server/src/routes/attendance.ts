import { randomUUID } from "node:crypto";
import {
  and,
  count,
  desc,
  eq,
  ne,
} from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CloseAttendanceSessionParams,
  CloseAttendanceSessionResponse,
  CreateClassBody,
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
import {
  attendanceRecordsTable,
  attendanceSessionsTable,
  classroomsTable,
  countSnapshotsTable,
  db,
  studentsTable,
} from "@workspace/db";

const router: IRouter = Router();
const QR_TTL_MS = 45_000;
const REVIEW_DIFFERENCE = 2;
const REVIEW_CONFIDENCE = 0.65;

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

async function getClassCounts(classId: number, sessionId: number): Promise<{
  studentCount: number;
  checkedInCount: number;
}> {
  const [studentResult] = await db
    .select({ value: count() })
    .from(studentsTable)
    .where(eq(studentsTable.classId, classId));
  const [checkInResult] = await db
    .select({ value: count() })
    .from(attendanceRecordsTable)
    .where(
      and(
        eq(attendanceRecordsTable.sessionId, sessionId),
        ne(attendanceRecordsTable.status, "absent"),
      ),
    );
  return {
    studentCount: Number(studentResult?.value ?? 0),
    checkedInCount: Number(checkInResult?.value ?? 0),
  };
}

async function getSessionPayload(sessionId: number) {
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
    .where(eq(attendanceSessionsTable.id, sessionId));
  if (!joined) {
    return null;
  }

  let session = joined.session;
  if (
    session.status === "active" &&
    session.qrExpiresAt.getTime() <= Date.now()
  ) {
    const nextToken = randomUUID();
    const nextExpiry = new Date(Date.now() + QR_TTL_MS);
    const [updated] = await db
      .update(attendanceSessionsTable)
      .set({ qrToken: nextToken, qrExpiresAt: nextExpiry })
      .where(eq(attendanceSessionsTable.id, sessionId))
      .returning();
    if (updated) {
      session = updated;
    }
  }

  const counts = await getClassCounts(session.classId, session.id);
  return {
    id: session.id,
    classId: session.classId,
    className: joined.classroom.name,
    subject: joined.classroom.subject,
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    endedAt: iso(session.endedAt),
    qrToken: session.qrToken,
    qrExpiresAt: session.qrExpiresAt.toISOString(),
    studentCount: counts.studentCount,
    checkedInCount: counts.checkedInCount,
  };
}

async function getClassroomPayload(classroom: typeof classroomsTable.$inferSelect) {
  const [result] = await db
    .select({ value: count() })
    .from(studentsTable)
    .where(eq(studentsTable.classId, classroom.id));
  return {
    id: classroom.id,
    name: classroom.name,
    subject: classroom.subject,
    room: classroom.room,
    studentCount: Number(result?.value ?? 0),
  };
}

router.get("/attendance/overview", async (req, res): Promise<void> => {
  const [classrooms, students, sessions, records] = await Promise.all([
    db.select().from(classroomsTable),
    db.select().from(studentsTable),
    db
      .select()
      .from(attendanceSessionsTable)
      .orderBy(desc(attendanceSessionsTable.startedAt))
      .limit(8),
    db.select().from(attendanceRecordsTable),
  ]);

  const sessionPayloads = await Promise.all(
    sessions.map((session) => getSessionPayload(session.id)),
  );
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayCount = sessions.filter(
    (session) => session.startedAt.getTime() >= today.getTime(),
  ).length;
  const presentCount = records.filter(
    (record) => record.status === "present" || record.status === "late",
  ).length;
  const possibleCount = sessions.reduce((total, session) => {
    return (
      total +
      students.filter((student) => student.classId === session.classId).length
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
      createdAt: (index === 0 ? session.startedAt : session.endedAt ?? session.startedAt).toISOString(),
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
  const classrooms = await db.select().from(classroomsTable);
  const payload = await Promise.all(classrooms.map(getClassroomPayload));
  res.json(ListClassesResponse.parse(payload));
});

router.post("/classes", async (req, res): Promise<void> => {
  const input = CreateClassBody.safeParse(req.body);
  if (!input.success) {
    req.log.warn({ errors: input.error.message }, "Invalid class input");
    res.status(400).json({ error: input.error.message });
    return;
  }

  const [classroom] = await db
    .insert(classroomsTable)
    .values(input.data)
    .returning();
  const payload = await getClassroomPayload(classroom);
  res.status(201).json(CreateClassResponse.parse(payload));
});

router.get("/classes/:classId/students", async (req, res): Promise<void> => {
  const params = ListClassStudentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const students = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.classId, params.data.classId));
  const sessions = await db
    .select()
    .from(attendanceSessionsTable)
    .where(eq(attendanceSessionsTable.classId, params.data.classId));
  const records = await db.select().from(attendanceRecordsTable);
  const payload = students.map((student) => {
    const classSessions = sessions.length;
    const attended = records.filter(
      (record) =>
        record.studentId === student.id &&
        record.status !== "absent" &&
        sessions.some((session) => session.id === record.sessionId),
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

router.get("/sessions", async (req, res): Promise<void> => {
  const query = ListAttendanceSessionsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const sessions = await db
    .select()
    .from(attendanceSessionsTable)
    .where(
      query.data.classId === undefined
        ? undefined
        : eq(attendanceSessionsTable.classId, query.data.classId),
    )
    .orderBy(desc(attendanceSessionsTable.startedAt));
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
  const [classroom] = await db
    .select()
    .from(classroomsTable)
    .where(eq(classroomsTable.id, input.data.classId));
  if (!classroom) {
    res.status(404).json({ error: "Class not found" });
    return;
  }
  const [existing] = await db
    .select()
    .from(attendanceSessionsTable)
    .where(
      and(
        eq(attendanceSessionsTable.classId, input.data.classId),
        eq(attendanceSessionsTable.status, "active"),
      ),
    );
  if (existing) {
    const payload = await getSessionPayload(existing.id);
    res.status(201).json(CreateAttendanceSessionResponse.parse(payload));
    return;
  }
  const now = new Date();
  const [session] = await db
    .insert(attendanceSessionsTable)
    .values({
      classId: input.data.classId,
      status: "active",
      qrToken: randomUUID(),
      qrExpiresAt: new Date(now.getTime() + QR_TTL_MS),
      startedAt: now,
    })
    .returning();
  const payload = await getSessionPayload(session.id);
  res.status(201).json(CreateAttendanceSessionResponse.parse(payload));
});

router.get("/sessions/:sessionId", async (req, res): Promise<void> => {
  const params = GetAttendanceSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
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
  const [updated] = await db
    .update(attendanceSessionsTable)
    .set({ status: "closed", endedAt: new Date() })
    .where(eq(attendanceSessionsTable.id, params.data.sessionId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
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
    const records = await db
      .select({
        record: attendanceRecordsTable,
        student: studentsTable,
      })
      .from(attendanceRecordsTable)
      .innerJoin(
        studentsTable,
        eq(attendanceRecordsTable.studentId, studentsTable.id),
      )
      .where(
        eq(attendanceRecordsTable.sessionId, params.data.sessionId),
      );
    const payload = records.map(({ record, student }) => ({
      id: record.id,
      sessionId: record.sessionId,
      studentId: record.studentId,
      studentName: student.fullName,
      studentCode: student.studentCode,
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
    const [session] = await db
      .select()
      .from(attendanceSessionsTable)
      .where(eq(attendanceSessionsTable.id, params.data.sessionId));
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
      .select()
      .from(studentsTable)
      .where(
        and(
          eq(studentsTable.studentCode, input.data.studentCode.trim()),
          eq(studentsTable.classId, session.classId),
        ),
      );
    if (!student) {
      res.status(400).json({ error: "Student is not in this class" });
      return;
    }
    const [existing] = await db
      .select()
      .from(attendanceRecordsTable)
      .where(
        and(
          eq(attendanceRecordsTable.sessionId, session.id),
          eq(attendanceRecordsTable.studentId, student.id),
        ),
      );
    if (existing) {
      res.status(400).json({ error: "Student has already checked in" });
      return;
    }
    const now = new Date();
    const [record] = await db
      .insert(attendanceRecordsTable)
      .values({
        sessionId: session.id,
        studentId: student.id,
        status: "present",
        checkedInAt: now,
        updatedAt: now,
      })
      .returning();
    res.status(201).json(
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
  const [updated] = await db
    .update(attendanceRecordsTable)
    .set({
      status: input.data.status,
      note: input.data.note ?? null,
      checkedInAt:
        input.data.status === "absent" ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(attendanceRecordsTable.id, params.data.recordId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Attendance record not found" });
    return;
  }
  const [student] = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.id, updated.studentId));
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

router.post(
  "/sessions/:sessionId/counts",
  async (req, res): Promise<void> => {
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
    const [session] = await db
      .select()
      .from(attendanceSessionsTable)
      .where(eq(attendanceSessionsTable.id, params.data.sessionId));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (session.status !== "active") {
      res.status(400).json({ error: "Cannot save a camera count for a closed session" });
      return;
    }
    const [snapshot] = await db
      .insert(countSnapshotsTable)
      .values({
        sessionId: session.id,
        estimatedCount: input.data.estimatedCount,
        confidence: input.data.confidence,
        source: input.data.source,
      })
      .returning();
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
  },
);

router.get(
  "/sessions/:sessionId/reconciliation",
  async (req, res): Promise<void> => {
    const params = GetSessionReconciliationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const payload = await getSessionPayload(params.data.sessionId);
    if (!payload) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const [latestSnapshot] = await db
      .select()
      .from(countSnapshotsTable)
      .where(eq(countSnapshotsTable.sessionId, params.data.sessionId))
      .orderBy(desc(countSnapshotsTable.capturedAt))
      .limit(1);
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
  const classes = await db.select().from(classroomsTable);
  const selectedClasses =
    query.data.classId === undefined
      ? classes
      : classes.filter((classroom) => classroom.id === query.data.classId);
  const [students, allSessions, records] = await Promise.all([
    db.select().from(studentsTable),
    db.select().from(attendanceSessionsTable),
    db.select().from(attendanceRecordsTable),
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
    const possible = classStudents.length * classSessions.length;
    return {
      classId: classroom.id,
      className: classroom.name,
      studentCount: classStudents.length,
      attendanceRate:
        possible === 0 ? 0 : Math.round((attended / possible) * 1000) / 10,
      sessionsCount: classSessions.length,
    };
  });
  const totalPossible = rows.reduce(
    (total, row) => total + row.studentCount * row.sessionsCount,
    0,
  );
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
