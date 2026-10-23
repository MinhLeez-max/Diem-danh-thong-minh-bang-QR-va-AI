import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { db, lockResource, sql } from "./index";

export async function migrate() {
  const directory = new URL("../migrations/", import.meta.url);
  const files = (await readdir(directory))
    .filter((file) => /^\d+.*\.sql$/.test(file))
    .sort();
  await db.transaction().execute(async (tx) => {
    await lockResource(tx, "attendance-schema-migrations");
    await sql`IF OBJECT_ID('dbo.schema_migrations','U') IS NULL
      CREATE TABLE dbo.schema_migrations (name nvarchar(200) PRIMARY KEY, checksum char(64) NOT NULL,
        applied_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME());`.execute(
      tx,
    );
    for (const file of files) {
      const contents = await readFile(new URL(file, directory), "utf8");
      const checksum = createHash("sha256").update(contents).digest("hex");
      const previous = await sql<{
        checksum: string;
      }>`SELECT checksum FROM dbo.schema_migrations WHERE name=${file}`.execute(
        tx,
      );
      if (previous.rows[0]) {
        if (previous.rows[0].checksum !== checksum)
          throw new Error(
            `Applied migration ${file} was modified. Add a new migration instead.`,
          );
        continue;
      }
      // Contents are version-controlled SQL, never request input.
      await sql.raw(contents).execute(tx);
      await sql`INSERT INTO dbo.schema_migrations(name,checksum) VALUES (${file},${checksum})`.execute(
        tx,
      );
      console.log(`Applied ${file}`);
    }
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  migrate()
    .catch((error: unknown) => {
      console.error(
        "SQL Server migration failed:",
        error instanceof Error ? error.message : "Unknown error",
      );
      process.exitCode = 1;
    })
    .finally(() => db.destroy());
