import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import shiftRoutes from "./attendance/shift.routes.js";
import assignmentRoutes from "./attendance/assignment.routes.js";
import checkInCheckOutRoutes from "./attendance/checkin-checkout.routes.js";
import shiftRequestRoutes from "./attendance/shift-request.routes.js";
import overtimeRequestRoutes from "./attendance/overtime-request.routes.js";
import reportRoutes from "./attendance/report.routes.js";
import lateRegularizationRoutes from "./attendance/late-regularization.routes.js";
const attendanceRouter = Router();
const attendanceModules = [
    shiftRoutes,
    assignmentRoutes,
    checkInCheckOutRoutes,
    shiftRequestRoutes,
    overtimeRequestRoutes,
    reportRoutes,
    lateRegularizationRoutes,
];
attendanceRouter.use(protect);
attendanceModules.forEach((routeModule) => attendanceRouter.use(routeModule));
export default attendanceRouter;
//# sourceMappingURL=attendance.routes.js.map