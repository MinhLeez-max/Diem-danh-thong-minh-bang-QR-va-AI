import { and, count, desc, eq, inArray, ne } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetCurrentSchoolUserResponse,
  ListSchoolUsersResponse,
  UpdateSchoolUserBody,
  UpdateSchoolUserParams,
  UpdateSchoolUserResponse,
} from "@workspace/api-zod";
import {
  classroomsTable,
  db,
  schoolUsersTable,
  studentsTable,
  teacherClassAssignmentsTable,
} from "@workspace/db";
import {
  currentSchoolUser,
  requireRole,
  type SchoolUserRecord,
} from "../middlewares/schoolAuth";

const router: IRouter = Router();

async function schoolUserPayload(user: SchoolUserRecord) {
  const [student] = user.studentId
    ? await db
        .select()
        .from(studentsTable)
        .where(eq(studentsTable.id, user.studentId))
        .limit(1)
    : [];
  const assignments = await db
    .select({ classId: teacherClassAssignmentsTable.classId })
    .from(teacherClassAssignmentsTable)
    .where(eq(teacherClassAssignmentsTable.schoolUserId, user.id));
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    studentId: user.studentId,
    studentCode: student?.studentCode ?? null,
    studentName: student?.fullName ?? null,
    classIds: assignments.map((assignment) => assignment.classId),
    createdAt: user.createdAt,
  };
}

router.get("/auth/me", async (_req, res): Promise<void> => {
  res.json(
    GetCurrentSchoolUserResponse.parse(
      await schoolUserPayload(currentSchoolUser(res)),
    ),
  );
});

router.get(
  "/admin/users",
  requireRole("admin"),
  async (_req, res): Promise<void> => {
    const users = await db
      .select()
      .from(schoolUsersTable)
      .orderBy(desc(schoolUsersTable.createdAt));
    const payload = await Promise.all(users.map(schoolUserPayload));
    res.json(ListSchoolUsersResponse.parse(payload));
  },
);

router.patch(
  "/admin/users/:userId",
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const params = UpdateSchoolUserParams.safeParse(req.params);
    const input = UpdateSchoolUserBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!input.success) {
      res.status(400).json({ error: input.error.message });
      return;
    }

    const [target] = await db
      .select()
      .from(schoolUsersTable)
      .where(eq(schoolUsersTable.id, params.data.userId))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "Không tìm thấy tài khoản." });
      return;
    }

    const classIds = [...new Set(input.data.classIds)];
    if (classIds.length !== input.data.classIds.length) {
      res.status(400).json({ error: "Danh sách lớp bị trùng." });
      return;
    }
    if (input.data.role === "student" && input.data.studentId === null) {
      res.status(400).json({ error: "Hãy liên kết hồ sơ học sinh trước." });
      return;
    }
    if (input.data.role !== "student" && input.data.studentId !== null) {
      res.status(400).json({
        error: "Chỉ tài khoản học sinh mới được liên kết hồ sơ học sinh.",
      });
      return;
    }
    if (input.data.role !== "teacher" && classIds.length > 0) {
      res.status(400).json({
        error: "Chỉ tài khoản giáo viên mới được phân công lớp.",
      });
      return;
    }

    if (input.data.role === "student" && input.data.studentId !== null) {
      const [student] = await db
        .select({ id: studentsTable.id })
        .from(studentsTable)
        .where(eq(studentsTable.id, input.data.studentId))
        .limit(1);
      if (!student) {
        res.status(404).json({ error: "Không tìm thấy hồ sơ học sinh." });
        return;
      }
      const [otherAccount] = await db
        .select({ id: schoolUsersTable.id })
        .from(schoolUsersTable)
        .where(
          and(
            eq(schoolUsersTable.studentId, input.data.studentId),
            ne(schoolUsersTable.id, target.id),
          ),
        )
        .limit(1);
      if (otherAccount) {
        res.status(409).json({
          error: "Hồ sơ học sinh đã được liên kết với tài khoản khác.",
        });
        return;
      }
    }

    if (classIds.length > 0) {
      const existingClasses = await db
        .select({ id: classroomsTable.id })
        .from(classroomsTable)
        .where(inArray(classroomsTable.id, classIds));
      if (existingClasses.length !== classIds.length) {
        res.status(404).json({ error: "Một hoặc nhiều lớp không tồn tại." });
        return;
      }
    }

    if (target.role === "admin" && input.data.role !== "admin") {
      const [adminCount] = await db
        .select({ value: count() })
        .from(schoolUsersTable)
        .where(eq(schoolUsersTable.role, "admin"));
      if (Number(adminCount?.value ?? 0) <= 1) {
        res.status(409).json({
          error: "Không thể hạ quyền quản trị viên cuối cùng của trường.",
        });
        return;
      }
    }

    const updated = await db.transaction(async (tx) => {
      const [saved] = await tx
        .update(schoolUsersTable)
        .set({
          role: input.data.role,
          studentId: input.data.studentId,
        })
        .where(eq(schoolUsersTable.id, target.id))
        .returning();
      await tx
        .delete(teacherClassAssignmentsTable)
        .where(eq(teacherClassAssignmentsTable.schoolUserId, target.id));
      if (input.data.role === "teacher" && classIds.length > 0) {
        await tx.insert(teacherClassAssignmentsTable).values(
          classIds.map((classId) => ({
            schoolUserId: target.id,
            classId,
          })),
        );
      }
      return saved;
    });

    res.json(
      UpdateSchoolUserResponse.parse(await schoolUserPayload(updated)),
    );
  },
);

export default router;
