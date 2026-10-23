import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import healthRouter from "./routes/health";
import { HttpError } from "./lib/http-error";
import { isUniqueViolation } from "@workspace/db";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use("/api", healthRouter);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", (_req, res, next) => {
  if (!process.env.CLERK_SECRET_KEY || !process.env.CLERK_PUBLISHABLE_KEY) {
    res
      .status(503)
      .json({
        error: "Đăng nhập chưa được cấu hình. Vui lòng liên hệ quản trị viên.",
        code: "AUTH_NOT_CONFIGURED",
      });
    return;
  }
  next();
});
app.use(
  clerkMiddleware((req) => ({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  })),
);

app.use("/api", router);

export const handleError: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (isUniqueViolation(error)) {
    res
      .status(409)
      .json({ error: "Dữ liệu bị trùng. Vui lòng tải lại và kiểm tra." });
    return;
  }
  if (error?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Nội dung JSON không hợp lệ." });
    return;
  }
  if (error?.type === "entity.too.large") {
    res.status(413).json({ error: "Dữ liệu gửi lên quá lớn." });
    return;
  }
  req.log.error({ err: error }, "Request failed");
  res
    .status(500)
    .json({ error: "Không thể xử lý yêu cầu. Vui lòng thử lại sau." });
};
app.use(handleError);
export default app;
