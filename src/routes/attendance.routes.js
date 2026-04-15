import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import shiftRoutes from "./attendance/shift.routes.js";
import assignmentRoutes from "./attendance/assignment.routes.js";
import checkInCheckOutRoutes from "./attendance/checkin-checkout.routes.js";
import shiftRequestRoutes from "./attendance/shift-request.routes.js";
import overtimeRequestRoutes from "./attendance/overtime-request.routes.js";
import reportRoutes from "./attendance/report.routes.js";

const attendanceRouter = Router();

attendanceRouter.use(protect);
attendanceRouter.use(shiftRoutes);
attendanceRouter.use(assignmentRoutes);
attendanceRouter.use(checkInCheckOutRoutes);
attendanceRouter.use(shiftRequestRoutes);
attendanceRouter.use(overtimeRequestRoutes);
attendanceRouter.use(reportRoutes);

export default attendanceRouter;
