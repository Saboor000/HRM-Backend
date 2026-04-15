import {
  getDailyAttendanceReportService,
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

export const getDailyReport = async (req, res, next) => {
  try {
    const { date, department } = req.query;
    const data = await getDailyAttendanceReportService(requireIsoDate(date, "date"), department);
    send(res, 200, "Daily report retrieved successfully", data);
  } catch (err) {
    next(err);
  }
};

export const getWeeklyReport = async (req, res, next) => {
  try {
    const { week_of, year } = req.query;
    const data = await getWeeklyAttendanceReportService(requireIsoDate(week_of, "week_of"), toInt(year));
    send(res, 200, "Weekly report retrieved successfully", data);
  } catch (err) {
    next(err);
  }
};

export const getMonthlyReport = async (req, res, next) => {
  try {
    const { month, year, department } = req.query;
    const data = await getMonthlyAttendanceReportService(toInt(month), toInt(year), department);
    send(res, 200, "Monthly report retrieved successfully", data);
  } catch (err) {
    next(err);
  }
};

export const getTeamSummaryReport = async (req, res, next) => {
  try {
    const { start_date, end_date, team_id } = req.query;
    const data = await getTeamSummaryReportService(
      requireIsoDate(start_date, "start_date"),
      requireIsoDate(end_date, "end_date"),
      team_id
    );
    send(res, 200, "Team summary report retrieved successfully", data);
  } catch (err) {
    next(err);
  }
};
