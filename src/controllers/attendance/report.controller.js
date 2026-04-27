import {
  getDailyAttendanceReportService,
  getMyAttendanceReportService,
  getWeeklyAttendanceReportService,
  getMonthlyAttendanceReportService,
  getTeamSummaryReportService,
} from "../../services/attendance/report.service.js";
import { getLeavesService } from "../../services/leave.service.js";
import { getOvertimeRequestsService } from "../../services/attendance/overtime-request.service.js";

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

export const getAttendanceReport = async (req, res, next) => {
  try {
    const query = req.validatedQuery || req.query;
    const type = query.report_type;

    if (type === "daily") {
      const data = await getDailyAttendanceReportService(
        requireIsoDate(query.date, "date"),
        query.department
      );
      send(res, 200, "Daily report retrieved successfully", data);
      return;
    }

    if (type === "weekly") {
      const data = await getWeeklyAttendanceReportService(
        requireIsoDate(query.week_of, "week_of"),
        toInt(query.year)
      );
      send(res, 200, "Weekly report retrieved successfully", data);
      return;
    }

    if (type === "monthly") {
      const data = await getMonthlyAttendanceReportService(
        toInt(query.month),
        toInt(query.year),
        query.department
      );
      send(res, 200, "Monthly report retrieved successfully", data);
      return;
    }

    if (type === "summary") {
      const data = await getTeamSummaryReportService(
        requireIsoDate(query.start_date, "start_date"),
        requireIsoDate(query.end_date, "end_date"),
        query.team_id
      );
      send(res, 200, "Team summary report retrieved successfully", data);
      return;
    }

    if (type === "leaves") {
      const leaveQuery = {
        ...query,
        ...(query.start_date ? { start_date: requireIsoDate(query.start_date, "start_date") } : {}),
        ...(query.end_date ? { end_date: requireIsoDate(query.end_date, "end_date") } : {}),
      };
      const data = await getLeavesService({ user: req.user, query: leaveQuery });
      send(res, 200, "Leave report retrieved successfully", data.leaves, data.pagination);
      return;
    }

    if (type === "overtime") {
      const page = toInt(query.page ?? 1);
      const limit = toInt(query.limit ?? 10);
      const filters = {};
      if (query.employee_id) filters.employee_id = query.employee_id;
      if (query.status) filters.status = query.status;

      const data = await getOvertimeRequestsService(filters, page, limit);
      send(res, 200, "Overtime report retrieved successfully", data.data, data.pagination);
      return;
    }

    throw Object.assign(new Error("Unsupported report_type"), { status: 422 });
  } catch (err) {
    next(err);
  }
};
