import { Router } from "express";
import { authorize, protect } from "../middleware/auth.middleware.js";
import { validateQuery } from "../middleware/validateRequest.middleware.js";
import {
  getAttendanceAnalyticsDashboard,
  getDashboardOverview,
} from "../controllers/dashboard.controller.js";
import {
  dashboardAttendanceAnalyticsQuerySchema,
  dashboardOverviewQuerySchema,
} from "../validators/dashboard.validator.js";

const dashboardRouter = Router();
const dashboardRoles = authorize("admin", "hr", "manager", "employee");
const adminOnly = authorize("admin");
const hrOnly = authorize("hr");
const managerOnly = authorize("manager");
const employeeOnly = authorize("employee");

dashboardRouter.use(protect);

// Generic role-aware dashboard endpoints
dashboardRouter.get(
  "/dashboard/overview",
  dashboardRoles,
  validateQuery(dashboardOverviewQuerySchema),
  getDashboardOverview
);

dashboardRouter.get(
  "/dashboard/attendance-analytics",
  dashboardRoles,
  validateQuery(dashboardAttendanceAnalyticsQuerySchema),
  getAttendanceAnalyticsDashboard
);

// Role-specific endpoints for frontend routing convenience
dashboardRouter.get(
  "/dashboard/admin",
  adminOnly,
  validateQuery(dashboardOverviewQuerySchema),
  getDashboardOverview
);

dashboardRouter.get(
  "/dashboard/hr",
  hrOnly,
  validateQuery(dashboardOverviewQuerySchema),
  getDashboardOverview
);

dashboardRouter.get(
  "/dashboard/manager",
  managerOnly,
  validateQuery(dashboardOverviewQuerySchema),
  getDashboardOverview
);

dashboardRouter.get(
  "/dashboard/employee",
  employeeOnly,
  validateQuery(dashboardOverviewQuerySchema),
  getDashboardOverview
);

export default dashboardRouter;
