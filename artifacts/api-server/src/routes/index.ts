import { Router, type IRouter } from "express";
import healthRouter from "./health";
import attendanceRouter from "./attendance";
import authRouter from "./auth";
import studentCheckInRouter from "./student-check-in";
import { requireRole, requireSchoolUser } from "../middlewares/schoolAuth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireSchoolUser);
router.use(authRouter);
router.use(studentCheckInRouter);
router.use(requireRole("admin", "teacher"));
router.use(attendanceRouter);

export default router;
