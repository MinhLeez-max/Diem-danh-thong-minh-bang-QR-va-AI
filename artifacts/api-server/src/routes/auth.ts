import { Router, type IRouter } from "express";
import {
  GetCurrentSchoolUserResponse,
  ListSchoolUsersResponse,
  UpdateSchoolUserBody,
  UpdateSchoolUserParams,
  UpdateSchoolUserResponse,
} from "@workspace/api-zod";
import { db, lockResource } from "@workspace/db";
import { HttpError } from "../lib/http-error";
import {
  currentSchoolUser,
  requireRole,
  type SchoolUserRecord,
} from "../middlewares/schoolAuth";

const router: IRouter = Router();

async function schoolUserPayload(user: SchoolUserRecord) {
  const [student] = user.studentId
    ? await db
        .selectFrom("students")
        .where((eb) => eb("students.id", "=", user.studentId))
        .top(1)
        .selectAll()
        .execute()
    : [];
  const assignments = await db
    .selectFrom("teacherClassAssignments")
    .where((eb) => eb("teacherClassAssignments.schoolUserId", "=", user.id))
    .select(["teacherClassAssignments.classId as classId"])
    .execute();
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
      .selectFrom("schoolUsers")
      .orderBy("schoolUsers.createdAt", "desc")
      .selectAll()
      .execute();
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
      .selectFrom("schoolUsers")
      .where((eb) => eb("schoolUsers.id", "=", params.data.userId))
      .top(1)
      .selectAll()
      .execute();
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
        .selectFrom("students")
        .where((eb) => eb("students.id", "=", input.data.studentId))
        .top(1)
        .select(["students.id as id"])
        .execute();
      if (!student) {
        res.status(404).json({ error: "Không tìm thấy hồ sơ học sinh." });
        return;
      }
      const [otherAccount] = await db
        .selectFrom("schoolUsers")
        .where((eb) =>
          eb.and([
            eb("schoolUsers.studentId", "=", input.data.studentId),
            eb("schoolUsers.id", "!=", target.id),
          ]),
        )
        .top(1)
        .select(["schoolUsers.id as id"])
        .execute();
      if (otherAccount) {
        res.status(409).json({
          error: "Hồ sơ học sinh đã được liên kết với tài khoản khác.",
        });
        return;
      }
    }

    if (classIds.length > 0) {
      const existingClasses = await db
        .selectFrom("classrooms")
        .where((eb) => eb("classrooms.id", "in", classIds))
        .select(["classrooms.id as id"])
        .execute();
      if (existingClasses.length !== classIds.length) {
        res.status(404).json({ error: "Một hoặc nhiều lớp không tồn tại." });
        return;
      }
    }

    const updated = await db.transaction().execute(async (tx) => {
      // Recheck authorization and the last-admin invariant under a shared lock.
      // Concurrent demotions must never leave the school without an admin.
      await lockResource(tx, "school-user-bootstrap");
      const caller = await tx
        .selectFrom("schoolUsers")
        .selectAll()
        .where("id", "=", currentSchoolUser(res).id)
        .executeTakeFirst();
      if (caller?.role !== "admin")
        throw new HttpError(
          403,
          "Quyền quản trị đã thay đổi. Vui lòng tải lại.",
        );
      const latestTarget = await tx
        .selectFrom("schoolUsers")
        .selectAll()
        .where("id", "=", target.id)
        .executeTakeFirst();
      if (!latestTarget) throw new HttpError(404, "Không tìm thấy tài khoản.");
      if (latestTarget.role === "admin" && input.data.role !== "admin") {
        const admins = await tx
          .selectFrom("schoolUsers")
          .select((eb) => eb.fn.countAll<number>().as("value"))
          .where("role", "=", "admin")
          .executeTakeFirstOrThrow();
        if (Number(admins.value) <= 1)
          throw new HttpError(
            409,
            "Không thể hạ quyền quản trị viên cuối cùng của trường.",
          );
      }
      const [saved] = await tx
        .updateTable("schoolUsers")
        .set({
          role: input.data.role,
          studentId: input.data.studentId,
        })
        .where((eb) => eb("schoolUsers.id", "=", target.id))
        .outputAll("inserted")
        .execute();
      await tx
        .deleteFrom("teacherClassAssignments")
        .where((eb) =>
          eb("teacherClassAssignments.schoolUserId", "=", target.id),
        )
        .execute();
      if (input.data.role === "teacher" && classIds.length > 0) {
        await tx
          .insertInto("teacherClassAssignments")
          .values(
            classIds.map((classId) => ({
              schoolUserId: target.id,
              classId,
            })),
          )
          .execute();
      }
      return saved;
    });

    res.json(UpdateSchoolUserResponse.parse(await schoolUserPayload(updated)));
  },
);

export default router;
