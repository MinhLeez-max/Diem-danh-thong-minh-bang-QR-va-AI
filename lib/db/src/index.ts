import {
  CamelCasePlugin,
  Kysely,
  MssqlDialect,
  sql,
  type Transaction,
} from "kysely";
import * as Tarn from "tarn";
import * as Tedious from "tedious";
import type { Database } from "./schema";

export * from "./schema";
export { sql } from "kysely";

export function createDatabase(databaseName = process.env.DB_NAME) {
  const server = process.env.DB_HOST;
  const userName = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = databaseName;
  if (!server || !userName || !password || !database) {
    throw new Error(
      "SQL Server requires DB_HOST, DB_USER, DB_PASSWORD and DB_NAME. Configure runtime environment variables.",
    );
  }
  const port = Number(process.env.DB_PORT ?? 1433);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("DB_PORT must be a valid TCP port.");
  return new Kysely<Database>({
    dialect: new MssqlDialect({
      tarn: { ...Tarn, options: { min: 0, max: 10 } },
      tedious: {
        ...Tedious,
        connectionFactory: () =>
          new Tedious.Connection({
            server,
            authentication: {
              type: "default",
              options: { userName, password },
            },
            options: {
              database,
              port,
              encrypt: true,
              trustServerCertificate:
                process.env.DB_TRUST_SERVER_CERTIFICATE === "true",
              useUTC: true,
              connectTimeout: 15000,
            },
          }),
      },
    }),
    plugins: [new CamelCasePlugin()],
  });
}

export const db = createDatabase();

// SQL Server transaction-owned application locks serialize business operations
// across API instances; rollback/commit always releases the lock.
export async function lockResource(
  tx: Transaction<Database>,
  resource: string,
) {
  await sql`DECLARE @result int;
    EXEC @result = sys.sp_getapplock @Resource=${resource}, @LockMode='Exclusive',
      @LockOwner='Transaction', @LockTimeout=10000;
    IF @result < 0 THROW 51000, 'Unable to acquire application lock', 1;`.execute(
    tx,
  );
}

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const item = error as {
    number?: number;
    cause?: unknown;
    errors?: unknown[];
  };
  return (
    item.number === 2601 ||
    item.number === 2627 ||
    (item.cause !== error && isUniqueViolation(item.cause)) ||
    (Array.isArray(item.errors) && item.errors.some(isUniqueViolation))
  );
}
