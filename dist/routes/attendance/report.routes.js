import { Router } from "express";
import { authorize } from "../../middleware/auth.middleware.js";
import { validateQuery } from "../../middleware/validateRequest.middleware.js";
import { getAttendanceReport, getMyAttendanceReport, } from "../../controllers/attendance/report.controller.js";
import { reportQuerySchema, } from "../../validators/attendance.validator.js";
const router = Router();
const adminHrManager = authorize("admin", "hr", "manager");
router.get("/attendance/reports", adminHrManager, validateQuery(reportQuerySchema), getAttendanceReport);
router.get("/attendance/reports/me", getMyAttendanceReport);
export default router;
//# sourceMappingURL=report.routes.js.map