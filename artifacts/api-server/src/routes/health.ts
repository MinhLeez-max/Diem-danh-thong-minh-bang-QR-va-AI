import { db } from "@workspace/db";
import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/readyz", async (_req, res) => {
  let database = false;
  try {
    await db.selectFrom("classrooms").select("id").top(1).execute();
    database = true;
  } catch { /* Return component state without disclosing driver errors. */ }
  const authentication = !!process.env.CLERK_SECRET_KEY && !!process.env.CLERK_PUBLISHABLE_KEY;
  res.status(database && authentication ? 200 : 503).json({
    status: database && authentication ? "ok" : "not_ready",
    database: database ? "ok" : "unavailable",
    authentication: authentication ? "configured" : "missing",
  });
});

export default router;
