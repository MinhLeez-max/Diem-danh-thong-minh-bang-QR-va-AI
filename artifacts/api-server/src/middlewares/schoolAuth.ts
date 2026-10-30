import { getAuth } from "@clerk/express";
import type { RequestHandler, Response } from "express";
import { db, lockResource, type SchoolUser } from "@workspace/db";

export type SchoolUserRecord = SchoolUser;
export type SchoolRole = "admin" | "teacher" | "student" | "pending";

export function currentSchoolUser(res: Response): SchoolUserRecord {
  return res.locals.schoolUser as SchoolUserRecord;
}

function claimString(claims: Record<string, unknown>, key: string): string {
  const value = claims[key];
  return typeof value === "string" ? value : "";
}

export async function resolveSchoolUser(
  userId: string,
  claims: Record<string, unknown> = {},
): Promise<SchoolUser> {
  let [schoolUser] = await db
    .selectFrom("schoolUsers")
    .where((eb) => eb("schoolUsers.clerkUserId", "=", userId))
    .top(1)
    .selectAll()
    .execute();

  if (!schoolUser) {
    const name =
      claimString(claims, "name") ||
      [claimString(claims, "firstName"), claimString(claims, "lastName")]
        .filter(Boolean)
        .join(" ") ||
      "Tài khoản mới";
    const email = claimString(claims, "email");

    schoolUser = await db.transaction().execute(async (tx) => {
      // Serialize first-account creation so simultaneous first sign-ins cannot
      // both claim the bootstrap administrator role.
      await lockResource(tx, "school-user-bootstrap");
      const [existing] = await tx
        .selectFrom("schoolUsers")
        .where((eb) => eb("schoolUsers.clerkUserId", "=", userId))
        .top(1)
        .selectAll()
        .execute();
      if (existing) {
        return existing;
      }

      const [userCount] = await tx
        .selectFrom("schoolUsers")
        .select((eb) => [eb.fn.countAll<number>().as("value")])
        .execute();
      const role = Number(userCount?.value ?? 0) === 0 ? "admin" : "pending";
      const [created] = await tx
        .insertInto("schoolUsers")
        .values({
          clerkUserId: userId,
          email,
          displayName: name,
          role,
        })
        .outputAll("inserted")
        .execute();
      return created;
    });
  }

  return schoolUser;
}

export const requireSchoolUser: RequestHandler = async (req, res, next) => {
  const auth = getAuth(req);
  req.log.info(
  {
    clerkAuthenticated: Boolean(auth.userId),
    authStatus: req.headers["x-clerk-auth-status"] ?? null,
    requestHost: req.headers.host,
  },
  "Clerk authentication diagnostic"
);
  if (!auth.userId) {
    res.status(401).json({ error: "Vui lòng đăng nhập để tiếp tục." });
    return;
  }

  try {
    const schoolUser = await resolveSchoolUser(
      auth.userId,
      (auth.sessionClaims ?? {}) as Record<string, unknown>,
    );

    res.locals.schoolUser = schoolUser;
    next();
  } catch (error) {
    req.log.error({ err: error }, "Unable to initialize school account");
    res.status(500).json({ error: "Không thể khởi tạo tài khoản trường học." });
  }
};

export function requireRole(...allowedRoles: SchoolRole[]): RequestHandler {
  return (_req, res, next) => {
    const user = res.locals.schoolUser as SchoolUserRecord | undefined;
    if (!user) {
      res.status(401).json({ error: "Vui lòng đăng nhập để tiếp tục." });
      return;
    }
    if (!allowedRoles.includes(user.role as SchoolRole)) {
      res.status(403).json({ error: "Tài khoản chưa được cấp quyền này." });
      return;
    }
    next();
  };
}

export async function accessibleClassIds(
  user: SchoolUserRecord,
): Promise<number[] | null> {
  if (user.role === "admin") {
    return null;
  }
  if (user.role !== "teacher") {
    return [];
  }
  const assignments = await db
    .selectFrom("teacherClassAssignments")
    .where((eb) => eb("teacherClassAssignments.schoolUserId", "=", user.id))
    .select(["teacherClassAssignments.classId as classId"])
    .execute();
  return assignments.map((assignment) => assignment.classId);
}

export async function ensureClassAccess(
  res: Response,
  classId: number,
): Promise<boolean> {
  const user = currentSchoolUser(res);
  if (user.role === "admin") {
    return true;
  }
  if (user.role !== "teacher") {
    res.status(403).json({ error: "Tài khoản chưa được cấp quyền này." });
    return false;
  }
  const [assignment] = await db
    .selectFrom("teacherClassAssignments")
    .where((eb) =>
      eb.and([
        eb("teacherClassAssignments.schoolUserId", "=", user.id),
        eb("teacherClassAssignments.classId", "=", classId),
      ]),
    )
    .top(1)
    .select(["teacherClassAssignments.id as id"])
    .execute();
  if (!assignment) {
    res.status(403).json({ error: "Lớp này chưa được phân công cho bạn." });
    return false;
  }
  return true;
}
