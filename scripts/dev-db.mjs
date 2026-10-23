import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(root, ".local/cloud");
const envPath = path.join(directory, "sqlserver.env");
const name = "attendance-sqlserver";
const image =
  "mcr.microsoft.com/mssql/server@sha256:cf8f0ab2ebe61feec2eed2629061a07d247f791c2a8ddda74a4ac9f06a291718";
const backupPath = path.join(directory, "attendance.bak");
function docker(args, env = process.env) {
  return execFileSync("docker", args, {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function exists() {
  try {
    docker(["container", "inspect", name]);
    return true;
  } catch {
    return false;
  }
}
function config() {
  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => {
        const position = line.indexOf("=");
        return [line.slice(0, position), line.slice(position + 1)];
      }),
  );
}
function query(sql) {
  const { DB_PASSWORD } = config();
  return docker(
    [
      "exec",
      "-e",
      "SQLCMDPASSWORD",
      name,
      "/opt/mssql-tools18/bin/sqlcmd",
      "-S",
      "localhost",
      "-U",
      "sa",
      "-C",
      "-b",
      "-h",
      "-1",
      "-W",
      "-Q",
      sql,
    ],
    { ...process.env, SQLCMDPASSWORD: DB_PASSWORD },
  );
}
async function up() {
  mkdirSync(directory, { recursive: true });
  if (!existsSync(envPath)) {
    if (exists())
      throw new Error(
        "The SQL Server container already exists but its local credentials are missing. Restore .local/cloud/sqlserver.env; do not reset the database.",
      );
    writeFileSync(
      envPath,
      `DB_HOST=localhost\nDB_PORT=1433\nDB_NAME=attendance\nDB_USER=sa\nDB_PASSWORD=${randomBytes(32).toString("base64url")}aA1!\nDB_TRUST_SERVER_CERTIFICATE=true\n`,
      { mode: 0o600 },
    );
  }
  if (exists()) docker(["start", name]);
  else {
    const { DB_PASSWORD } = config();
    docker(
      [
        "run",
        "-d",
        "--name",
        name,
        "-e",
        "ACCEPT_EULA=Y",
        "-e",
        "MSSQL_PID=Developer",
        "-e",
        "MSSQL_SA_PASSWORD",
        "-p",
        "127.0.0.1:1433:1433",
        "-v",
        "attendance-sqlserver-data:/var/opt/mssql",
        image,
      ],
      { ...process.env, MSSQL_SA_PASSWORD: DB_PASSWORD },
    );
  }
  let ready = false;
  for (let attempt = 0; attempt < 45; attempt++) {
    try {
      query("SELECT 1");
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  if (!ready)
    throw new Error(
      "SQL Server did not become ready; inspect docker logs attendance-sqlserver.",
    );
  const found = query(
    "SET NOCOUNT ON; SELECT CASE WHEN DB_ID('attendance') IS NULL THEN 0 ELSE 1 END",
  );
  if (found.trim() === "0") {
    if (existsSync(backupPath)) {
      docker(["exec", name, "mkdir", "-p", "/var/opt/mssql/backup"]);
      docker([
        "cp",
        backupPath,
        `${name}:/var/opt/mssql/backup/attendance.bak`,
      ]);
      docker(["exec", "-u", "0", name, "chown", "10001:10001", "/var/opt/mssql/backup/attendance.bak"]);
      query(
        "RESTORE DATABASE attendance FROM DISK='/var/opt/mssql/backup/attendance.bak' WITH MOVE 'attendance' TO '/var/opt/mssql/data/attendance.mdf', MOVE 'attendance_log' TO '/var/opt/mssql/data/attendance_log.ldf'",
      );
      console.log("Restored development database from the retained backup.");
    } else query("CREATE DATABASE attendance");
  }
  console.log(
    "SQL Server development database ready on port 1433. Credentials: .local/cloud/sqlserver.env (not printed).",
  );
}
try {
  switch (process.argv[2] ?? "up") {
    case "up":
      await up();
      break;
    case "backup":
      docker(["exec", name, "mkdir", "-p", "/var/opt/mssql/backup"]);
      query(
        "BACKUP DATABASE attendance TO DISK='/var/opt/mssql/backup/attendance.bak' WITH COPY_ONLY, INIT",
      );
      docker([
        "cp",
        `${name}:/var/opt/mssql/backup/attendance.bak`,
        backupPath,
      ]);
      chmodSync(backupPath, 0o600);
      console.log("Development backup saved to .local/cloud/attendance.bak.");
      break;
    case "stop":
      docker(["stop", name]);
      console.log("SQL Server stopped; data retained.");
      break;
    default:
      throw new Error("Usage: node scripts/dev-db.mjs [up|backup|stop]");
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "SQL Server setup failed.",
  );
  process.exitCode = 1;
}
