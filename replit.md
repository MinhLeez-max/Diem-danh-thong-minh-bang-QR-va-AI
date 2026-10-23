# Điểm danh thông minh bằng QR và AI

See README.md for SQL Server setup, Clerk configuration, SSMS and validation.

- Runtime: Node.js 24, pnpm 10.32.1, TypeScript, React/Vite and Express.
- Database: SQL Server 2022, Kysely + Tedious. PostgreSQL and DATABASE_URL are no longer used.
- Start development SQL Server: `node scripts/dev-db.mjs up`.
- Apply versioned SQL migrations: `pnpm --filter @workspace/db run migrate`.
- API: `PORT=5000 pnpm --filter @workspace/api-server run dev`.
- Frontend: `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/smart-attendance run dev`.
- Typecheck/build: `PORT=5173 BASE_PATH=/ pnpm run build`.
- API integration tests: `pnpm --filter @workspace/api-server test` (requires SQL Server credentials and create/drop database permissions).
- CSV tests: `pnpm --filter @workspace/smart-attendance test`.
- Codegen: `pnpm --filter @workspace/api-spec run codegen`.
- DB environment: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, optional DB_TRUST_SERVER_CERTIFICATE.
- Auth environment: CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, VITE_CLERK_PUBLISHABLE_KEY.

Retain school role boundaries and account-linked QR attendance. Camera analysis is aggregate headcount only; never identify faces or store frames.
