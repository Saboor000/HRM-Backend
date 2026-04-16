import { Router } from "express";
import { authorize } from "../../middleware/auth.middleware.js";
import { validateQuery } from "../../middleware/validateRequest.middleware.js";
import {
  getDailyReport,
  getMyAttendanceReport,
  getWeeklyReport,
  getMonthlyReport,
  getTeamSummaryReport,
} from "../../controllers/attendance/report.controller.js";
import {
  dailyReportQuerySchema,
  weeklyReportQuerySchema,
  monthlyReportQuerySchema,
  summaryReportQuerySchema,
} from "../../validators/attendance.validator.js";

const router = Router();
const adminHr = authorize("admin", "hr");

router.get(
  "/attendance/reports/daily",
  adminHr,
  validateQuery(dailyReportQuerySchema),
  getDailyReport,
);
router.get(
  "/attendance/reports/weekly",
  adminHr,
  validateQuery(weeklyReportQuerySchema),
  getWeeklyReport,
);
router.get(
  "/attendance/reports/monthly",
  adminHr,
  validateQuery(monthlyReportQuerySchema),
  getMonthlyReport,
);
router.get(
  "/attendance/reports/summary",
  adminHr,
  validateQuery(summaryReportQuerySchema),
  getTeamSummaryReport,
);
router.get("/attendance/reports/me", getMyAttendanceReport);

export default router;
