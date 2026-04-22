import {
  getCombinedAttendanceAnalyticsService,
  getDashboardOverviewService,
} from "../services/dashboard.service.js";

const send = (res, status, message, data) =>
  res.status(status).json({
    success: true,
    message,
    data,
  });

const run = (service, message) => async (req, res, next) => {
  try {
    const data = await service(req.user, req.validatedQuery || req.query);
    send(res, 200, message, data);
  } catch (err) {
    next(err);
  }
};

export const getDashboardOverview = run(
  getDashboardOverviewService,
  "Dashboard overview retrieved successfully"
);

export const getAttendanceAnalyticsDashboard = run(
  getCombinedAttendanceAnalyticsService,
  "Combined attendance analytics retrieved successfully"
);
