import { getAuth } from "@clerk/express";
import { and, count, eq, sql } from "drizzle-orm";
import type { RequestHandler, Response } from "express";
import {
  db,
  schoolUsersTable,
  teacherClassAssignmentsTable,
} from "@workspace/db";

export type SchoolUserRecord = typeof schoolUsersTable.$inferSelect;
export type SchoolRole = "admin" | "teacher" | "student" | "pending";

export function currentSchoolUser(res: Response): SchoolUserRecord {
  return res.locals.schoolUser as SchoolUserRecord;
}

function claimString(claims: Record<string, unknown>, key: string): string {
  const value = claims[key];
  return typeof value === "string" ? value : "";
}

export const requireSchoolUser: RequestHandler = async (req, res, next) => {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Vui lòng đăng nhập để tiếp tục." });
    return;
  }

  try {
    let [schoolUser] = await db
      .select()
      .from(schoolUsersTable)
      .where(eq(schoolUsersTable.clerkUserId, auth.userId))
      .limit(1);

    if (!schoolUser) {
      const claims = (auth.sessionClaims ?? {}) as Record<string, unknown>;
      const name =
        claimString(claims, "name") ||
        [
          claimString(claims, "firstName"),
          claimString(claims, "lastName"),
        ]
          .filter(Boolean)
          .join(" ") ||
        "Tài khoản mới";
      const email = claimString(claims, "email");

      schoolUser = await db.transaction(async (tx) => {
        // Serialize first-account creation so simultaneous first sign-ins cannot
        // both claim the bootstrap administrator role.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(78231581)`);
        const [existing] = await tx
          .select()
          .from(schoolUsersTable)
          .where(eq(schoolUsersTable.clerkUserId, auth.userId!))
          .limit(1);
        if (existing) {
          return existing;
        }

        const [userCount] = await tx
          .select({ value: count() })
          .from(schoolUsersTable);
        const role = Number(userCount?.value ?? 0) === 0 ? "admin" : "pending";
        const [created] = await tx
          .insert(schoolUsersTable)
          .values({
            clerkUserId: auth.userId!,
            email,
            displayName: name,
            role,
          })
          .returning();
        return created;
      });
    }

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
    .select({ classId: teacherClassAssignmentsTable.classId })
    .from(teacherClassAssignmentsTable)
    .where(eq(teacherClassAssignmentsTable.schoolUserId, user.id));
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
    .select({ id: teacherClassAssignmentsTable.id })
    .from(teacherClassAssignmentsTable)
    .where(
      and(
        eq(teacherClassAssignmentsTable.schoolUserId, user.id),
        eq(teacherClassAssignmentsTable.classId, classId),
      ),
    )
    .limit(1);
  if (!assignment) {
    res.status(403).json({ error: "Lớp này chưa được phân công cho bạn." });
    return false;
  }
  return true;
}
