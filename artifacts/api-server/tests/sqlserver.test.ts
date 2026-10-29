import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import type { Server } from "node:http";

// Every run owns a new disposable database. Never reset the caller's database.
const databaseName = `attendance_test_${randomUUID().replaceAll("-", "")}`;
process.env.DB_NAME = databaseName;
const { db, createDatabase, sql } = await import("@workspace/db");
const { migrate } = await import("../../../lib/db/src/migrate");
const { openSession, closeSession, recordCheckIn } =
  await import("../src/services/attendance");
const { resolveSchoolUser, requireRole } =
  await import("../src/middlewares/schoolAuth");
const { default: attendanceRouter } = await import("../src/routes/attendance");
const { default: authRouter } = await import("../src/routes/auth");
const { default: studentRouter } =
  await import("../src/routes/student-check-in");
const { default: productionApp, handleError } = await import("../src/app");
const adminDb = createDatabase("master");
let server: Server;
let realServer: Server;
let base: string;
let realBase: string;
let identities: Record<string, number> = {};

async function listen(app: express.Express) {
  const instance = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => instance.once("listening", resolve));
  const address = instance.address();
  assert(address && typeof address !== "string");
  return { instance, url: `http://127.0.0.1:${address.port}` };
}
async function request(
  path: string,
  user = "admin",
  method = "GET",
  body?: unknown,
) {
  return fetch(base + path, {
    method,
    headers: { "content-type": "application/json", "x-test-identity": user },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function classroom(label = randomUUID()) {
  return db
    .insertInto("classrooms")
    .values({ name: `Lớp ${label}`, subject: "Toán", room: "A101" })
    .outputAll("inserted")
    .executeTakeFirstOrThrow();
}
async function pupil(classId: number) {
  return db
    .insertInto("students")
    .values({ classId, fullName: "Nguyễn Minh Anh", studentCode: randomUUID() })
    .outputAll("inserted")
    .executeTakeFirstOrThrow();
}

before(async () => {
  await sql.raw(`CREATE DATABASE [${databaseName}]`).execute(adminDb);
  await migrate();
  await migrate(); // Repeatability must not recreate tables or lose data.
  const provisioned = await Promise.all(
    ["admin", "teacher", "student", "pending"].map((name) =>
      resolveSchoolUser(`test-${name}`, { name }),
    ),
  );
  assert.equal(
    provisioned.filter((user) => user.role === "admin").length,
    1,
    "simultaneous initial sign-ins produce one admin",
  );
  for (let i = 0; i < provisioned.length; i++) {
    const role = ["admin", "teacher", "student", "pending"][i];
    identities[role] = provisioned[i].id;
    await db
      .updateTable("schoolUsers")
      .set({ role })
      .where("id", "=", provisioned[i].id)
      .execute();
  }
  // Identity injection exists only in this test harness. Real routes and role /
  // class authorization are exercised against a real SQL Server database.
  const app = express();
  app.use(express.json());
  app.use(async (req, res, next) => {
    const id = identities[String(req.headers["x-test-identity"])];
    const user = id
      ? await db
          .selectFrom("schoolUsers")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirst()
      : undefined;
    if (!user) {
      res.status(401).json({ error: "Test identity missing" });
      return;
    }
    res.locals.schoolUser = user;
    req.log = { error() {}, warn() {} } as typeof req.log;
    next();
  });
  app.use("/api", authRouter, studentRouter);
  app.use("/api", requireRole("admin", "teacher"), attendanceRouter);
  app.use(handleError);
  const harness = await listen(app);
  server = harness.instance;
  base = harness.url;
  const production = await listen(productionApp);
  realServer = production.instance;
  realBase = production.url;
});
after(async () => {
  await Promise.all(
    [server, realServer]
      .filter(Boolean)
      .map(
        (instance) =>
          new Promise<void>((resolve, reject) =>
            instance.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
  await db.destroy();
  await sql
    .raw(
      `IF DB_ID('${databaseName}') IS NOT NULL DROP DATABASE [${databaseName}]`,
    )
    .execute(adminDb);
  await adminDb.destroy();
});

test("liveness works without Clerk; protected API returns a clear 503", async () => {
  const savedSecret = process.env.CLERK_SECRET_KEY;
  delete process.env.CLERK_SECRET_KEY;
  try {
    const health = await fetch(realBase + "/api/healthz");
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
    const ready = await fetch(realBase + "/api/readyz");
    assert.equal(ready.status, 503);
    assert.deepEqual(await ready.json(), { status: "not_ready", database: "ok", authentication: "missing" });
    const protectedResponse = await fetch(realBase + "/api/classes");
    assert.equal(protectedResponse.status, 503);
    assert.equal((await protectedResponse.json()).code, "AUTH_NOT_CONFIGURED");
  } finally {
    if (savedSecret !== undefined) process.env.CLERK_SECRET_KEY = savedSecret;
  }
});

test("Unicode class and pupil CRUD, trimming, duplicate code and validation", async () => {
  const response = await request("/api/classes", "admin", "POST", {
    name: "  10A1  ",
    subject: " Toán ",
    room: " A1 ",
  });
  assert.equal(response.status, 201);
  const room = await response.json();
  assert.equal(room.name, "10A1");
  const created = await request(
    `/api/classes/${room.id}/students`,
    "admin",
    "POST",
    { fullName: " Nguyễn Ánh ", studentCode: " HS01 " },
  );
  assert.equal(created.status, 201);
  assert.equal((await created.json()).fullName, "Nguyễn Ánh");
  assert.equal(
    (
      await request(`/api/classes/${room.id}/students`, "admin", "POST", {
        fullName: "B",
        studentCode: "HS01",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/api/classes", "admin", "POST", {
        name: " ",
        subject: "Toán",
        room: "A1",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/classes", "teacher", "POST", {
        name: "Forbidden",
        subject: "Toán",
        room: "A1",
      })
    ).status,
    403,
  );
});

test("teacher class boundaries, pending users and student-only QR routes", async () => {
  const allowed = await classroom();
  const forbidden = await classroom();
  await db
    .insertInto("teacherClassAssignments")
    .values({ schoolUserId: identities.teacher, classId: allowed.id })
    .execute();
  const response = await request("/api/classes", "teacher");
  const rooms = await response.json();
  assert.deepEqual(
    rooms.map((room: { id: number }) => room.id),
    [allowed.id],
  );
  assert.equal(
    (await request(`/api/classes/${forbidden.id}/students`, "teacher")).status,
    403,
  );
  assert.equal((await request("/api/classes", "student")).status, 403);
  assert.equal((await request("/api/classes", "pending")).status, 403);
  assert.equal((await request("/api/qr/test", "teacher")).status, 403);
});

test("concurrent open creates one session; concurrent scans create one record", async () => {
  const room = await classroom();
  const student = await pupil(room.id);
  const sessions = await Promise.all(
    Array.from({ length: 4 }, () => openSession(room.id)),
  );
  assert.equal(new Set(sessions.map((session) => session.id)).size, 1);
  const session = sessions[0];
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      recordCheckIn(session.id, student.id, session.qrToken),
    ),
  );
  assert.equal(results.filter((result) => !result.duplicate).length, 1);
  assert.equal(new Set(results.map((result) => result.record.id)).size, 1);
});

test("QR checks linked pupil/class/expiry and returns duplicate consistently", async () => {
  const room = await classroom();
  const student = await pupil(room.id);
  const session = await openSession(room.id);
  await db
    .updateTable("schoolUsers")
    .set({ studentId: student.id })
    .where("id", "=", identities.student)
    .execute();
  assert.equal(
    (await request(`/api/qr/${session.qrToken}`, "student")).status,
    200,
  );
  assert.equal(
    (
      await request(
        `/api/qr/${session.qrToken}/check-in`,
        "student",
        "POST",
        {},
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await request(
        `/api/qr/${session.qrToken}/check-in`,
        "student",
        "POST",
        {},
      )
    ).status,
    409,
  );
  const anotherRoom = await classroom();
  const anotherSession = await openSession(anotherRoom.id);
  assert.equal(
    (
      await request(
        `/api/qr/${anotherSession.qrToken}/check-in`,
        "student",
        "POST",
        {},
      )
    ).status,
    403,
  );
  await db
    .updateTable("attendanceSessions")
    .set({ qrExpiresAt: new Date(Date.now() - 1000) })
    .where("id", "=", anotherSession.id)
    .execute();
  assert.equal(
    (
      await request(
        `/api/qr/${anotherSession.qrToken}/check-in`,
        "student",
        "POST",
        {},
      )
    ).status,
    400,
  );
  const historyResponse = await request("/api/student/attendance", "student");
  assert.equal(historyResponse.status, 200);
  const history = await historyResponse.json();
  assert.equal(history.length, 1);
  assert.equal(history[0].sessionId, session.id);
  assert.equal(history[0].status, "present");
  assert.equal(
    (await request("/api/student/attendance", "teacher")).status,
    403,
  );
});

test("closing marks absent, preserves check-in, is idempotent and stabilizes historical reports", async () => {
  const room = await classroom();
  const present = await pupil(room.id);
  const absent = await pupil(room.id);
  const session = await openSession(room.id);
  const checked = await recordCheckIn(session.id, present.id, session.qrToken);
  const closed = await request(
    `/api/sessions/${session.id}/close`,
    "admin",
    "POST",
    {},
  );
  assert.equal(closed.status, 200);
  await closeSession(session.id);
  const records = await db
    .selectFrom("attendanceRecords")
    .selectAll()
    .where("sessionId", "=", session.id)
    .execute();
  assert.equal(records.length, 2);
  assert.equal(
    records.find((record) => record.studentId === absent.id)?.status,
    "absent",
  );
  assert.equal(
    records
      .find((record) => record.studentId === present.id)
      ?.checkedInAt?.getTime(),
    checked.record.checkedInAt?.getTime(),
  );
  await assert.rejects(
    () => recordCheckIn(session.id, absent.id, session.qrToken),
    /đã đóng/,
  );
  const before = await (
    await request(`/api/reports/attendance?classId=${room.id}`)
  ).json();
  assert.equal(before.overallAttendanceRate, 50);
  await pupil(room.id);
  const after = await (
    await request(`/api/reports/attendance?classId=${room.id}`)
  ).json();
  assert.equal(after.overallAttendanceRate, 50);
  assert.equal(after.rows[0].attendanceRate, 50);
  const edited = await request(
    `/api/attendance/${checked.record.id}`,
    "admin",
    "PATCH",
    { status: "late" },
  );
  assert.equal(edited.status, 200);
  assert.equal(
    new Date((await edited.json()).checkedInAt).getTime(),
    checked.record.checkedInAt?.getTime(),
  );
});

test("close and scan racing cannot insert after absence finalization", async () => {
  const room = await classroom();
  const student = await pupil(room.id);
  const session = await openSession(room.id);
  await Promise.allSettled([
    closeSession(session.id),
    recordCheckIn(session.id, student.id, session.qrToken),
  ]);
  const records = await db
    .selectFrom("attendanceRecords")
    .selectAll()
    .where("sessionId", "=", session.id)
    .execute();
  assert.equal(records.length, 1);
  assert(["present", "absent"].includes(records[0].status));
});

test("camera snapshots and reconciliation store aggregate numbers only", async () => {
  const room = await classroom();
  const session = await openSession(room.id);
  const response = await request(
    `/api/sessions/${session.id}/counts`,
    "admin",
    "POST",
    { estimatedCount: 5, confidence: 0.9, source: "camera" },
  );
  assert.equal(response.status, 201);
  const reconciliation = await (
    await request(`/api/sessions/${session.id}/reconciliation`)
  ).json();
  assert.equal(reconciliation.estimatedCount, 5);
  assert.equal(reconciliation.needsReview, true);
  await closeSession(session.id);
  assert.equal(
    (
      await request(`/api/sessions/${session.id}/counts`, "admin", "POST", {
        estimatedCount: 5,
        confidence: 0.9,
        source: "camera",
      })
    ).status,
    400,
  );
});

test("last admin cannot be demoted; duplicate pupil links are rejected", async () => {
  const response = await request(
    `/api/admin/users/${identities.admin}`,
    "admin",
    "PATCH",
    { role: "pending", studentId: null, classIds: [] },
  );
  assert.equal(response.status, 409);
  const room = await classroom();
  const student = await pupil(room.id);
  const linked = await request(
    `/api/admin/users/${identities.student}`,
    "admin",
    "PATCH",
    { role: "student", studentId: student.id, classIds: [] },
  );
  assert.equal(linked.status, 200);
  const duplicate = await request(
    `/api/admin/users/${identities.pending}`,
    "admin",
    "PATCH",
    { role: "student", studentId: student.id, classIds: [] },
  );
  assert.equal(duplicate.status, 409);
});

test('expired QR rotates once under concurrent readers and never rotates a closed session', async () => {
  const room = await classroom();
  const session = await openSession(room.id);
  await db.updateTable('attendanceSessions').set({ qrExpiresAt: new Date(Date.now() - 1000) }).where('id', '=', session.id).execute();
  const responses = await Promise.all(Array.from({ length: 4 }, async () => {
    const response = await request(`/api/sessions/${session.id}`);
    assert.equal(response.status, 200); return response.json();
  }));
  assert.equal(new Set(responses.map(response => response.qrToken)).size, 1);
  assert.notEqual(responses[0].qrToken, session.qrToken);
  await closeSession(session.id);
  const response = await (await request(`/api/sessions/${session.id}`)).json();
  assert.equal(response.qrToken, responses[0].qrToken);
});

test('concurrent admin demotions retain at least one administrator', async () => {
  const extra = await resolveSchoolUser('extra-admin');
  await db.updateTable('schoolUsers').set({ role: 'admin' }).where('id', '=', extra.id).execute();
  identities.extra = extra.id;
  const responses = await Promise.all([
    request(`/api/admin/users/${identities.admin}`, 'admin', 'PATCH', { role: 'pending', studentId: null, classIds: [] }),
    request(`/api/admin/users/${extra.id}`, 'extra', 'PATCH', { role: 'pending', studentId: null, classIds: [] }),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const admins = await db.selectFrom('schoolUsers').selectAll().where('role', '=', 'admin').execute();
  assert.equal(admins.length, 1);
});

test('Clerk verifies signed bearer sessions for /api/auth/me; missing, expired and tampered tokens stay unauthorized', async () => {
  const { generateKeyPairSync, createSign } = await import('node:crypto');
  const { clerkMiddleware } = await import('@clerk/express');
  const { requireSchoolUser } = await import('../src/middlewares/schoolAuth');
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  // Ephemeral test-only issuer and signing key: never accepted by the real app.
  const issuer = 'local-clerk-test.clerk.accounts.dev';
  const publishableKey = 'pk_test_' + Buffer.from(issuer + '$').toString('base64');
  function token(expiry: number) {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'local-test' })).toString('base64url');
    const claims = Buffer.from(JSON.stringify({ iss: `https://${issuer}`, sub: 'user_bearer_integration', sid: 'sess_bearer_integration', azp: 'http://localhost:5173', iat: now - 120, nbf: now - 120, exp: expiry, v: 2, sts: 'active', fva: [0, -1] })).toString('base64url');
    const payload = `${header}.${claims}`;
    return payload + '.' + createSign('RSA-SHA256').update(payload).sign(keys.privateKey, 'base64url');
  }
  const app = express();
  app.use(clerkMiddleware({ publishableKey, secretKey: 'sk_test_local_fixture_only', jwtKey: keys.publicKey, authorizedParties: ['http://localhost:5173'] }));
  app.use('/api', requireSchoolUser, authRouter);
  app.use(handleError);
  const runtime = await listen(app);
  try {
    const now = Math.floor(Date.now() / 1000);
    const valid = token(now + 60);
    const response = await fetch(runtime.url + '/api/auth/me', { headers: { authorization: `Bearer ${valid}` } });
    assert.equal(response.status, 200);
    const profile = await response.json(); assert.equal(profile.role, 'pending'); assert(profile.id > 0);
    const stored = await db.selectFrom('schoolUsers').selectAll().where('clerkUserId', '=', 'user_bearer_integration').executeTakeFirstOrThrow();
    assert.equal(profile.id, stored.id);
    assert.equal((await fetch(runtime.url + '/api/auth/me')).status, 401);
    assert.equal((await fetch(runtime.url + '/api/auth/me', { headers: { authorization: `Bearer ${token(now - 60)}` } })).status, 401);
    assert.equal((await fetch(runtime.url + '/api/auth/me', { headers: { authorization: `Bearer ${valid.slice(0, -8)}invalid!` } })).status, 401);
  } finally { await new Promise<void>((resolve, reject) => runtime.instance.close(error => error ? reject(error) : resolve())); }
});
