import {
  getDailyAttendanceReportService,
  getMyAttendanceReportService,
  getWeeklyAttendanceReportService,
  getMonthlyAttendanceReportService,
  getTeamSummaryReportService,
} from "../../services/attendance/report.service.js";

const toInt = (value) => Number.parseInt(value, 10);
const toIsoDate = (value) => {
  if (!value) return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().split("T")[0];
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (match) {
    const [, dd, mm, yyyy] = match;
    const normalized = `${yyyy}-${mm}-${dd}`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : normalized;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().split("T")[0];
};

const requireIsoDate = (value, label) => {
  const date = toIsoDate(value);
  if (!date) throw Object.assign(new Error(`Invalid ${label}. Use YYYY-MM-DD or DD-MM-YYYY`), { status: 400 });
  return date;
};

const send = (res, status, message, data, pagination) =>
  res.status(status).json({
    success: true,
    message,
    ...(data !== undefined ? { data } : {}),
    ...(pagination ? { pagination } : {}),
  });

const runReport = (service, message, getArgs) => async (req, res, next) => {
  try {
    const data = await service(...getArgs(req));
    send(res, 200, message, data);
  } catch (err) {
    next(err);
  }
};

export const getDailyReport = runReport(
  getDailyAttendanceReportService,
  "Daily report retrieved successfully",
  (req) => [requireIsoDate(req.query.date, "date"), req.query.department]
);

export const getWeeklyReport = runReport(
  getWeeklyAttendanceReportService,
  "Weekly report retrieved successfully",
  (req) => [requireIsoDate(req.query.week_of, "week_of"), toInt(req.query.year)]
);

export const getMonthlyReport = runReport(
  getMonthlyAttendanceReportService,
  "Monthly report retrieved successfully",
  (req) => [toInt(req.query.month), toInt(req.query.year), req.query.department]
);

export const getTeamSummaryReport = runReport(
  getTeamSummaryReportService,
  "Team summary report retrieved successfully",
  (req) => [
    requireIsoDate(req.query.start_date, "start_date"),
    requireIsoDate(req.query.end_date, "end_date"),
    req.query.team_id,
  ]
);

export const getMyAttendanceReport = async (req, res, next) => {
  try {
    const data = await getMyAttendanceReportService(req.user.id, req.query);
    send(
      res,
      200,
      "My attendance report retrieved successfully",
      {
        employee: data.employee,
        filters: data.filters,
        summary: data.summary,
        records: data.records,
      },
      data.pagination
    );
  } catch (err) {
    next(err);
  }
};
