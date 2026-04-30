import {
  getDailyAttendanceReportService,
  getMyAttendanceReportService,
  getWeeklyAttendanceReportService,
  getMonthlyAttendanceReportService,
  getTeamSummaryReportService,
} from "../../services/attendance/report.service.js";
import { getLeavesService } from "../../services/leave.service.js";
import { getOvertimeRequestsService } from "../../services/attendance/overtime-request.service.js";
import { getShiftsService } from "../../services/attendance/shift.service.js";
import { getAssignmentsService } from "../../services/attendance/assignment.service.js";
import { getShiftChangeRequestsService } from "../../services/attendance/shift-request.service.js";
import { listLateRegularizationsService } from "../../services/attendance/late-regularization.service.js";

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

    // ── attendance (daily / weekly / monthly / summary) ──────────────────────
    if (type === "attendance") {
      const subType = query.sub_type;

      if (subType === "daily") {
        const data = await getDailyAttendanceReportService(
          requireIsoDate(query.date, "date"),
          query.department
        );
        send(res, 200, "Daily attendance report retrieved successfully", data);
        return;
      }

      if (subType === "weekly") {
        const data = await getWeeklyAttendanceReportService(
          requireIsoDate(query.week_of, "week_of"),
          toInt(query.year)
        );
        send(res, 200, "Weekly attendance report retrieved successfully", data);
        return;
      }

      if (subType === "monthly") {
        const data = await getMonthlyAttendanceReportService(
          toInt(query.month),
          toInt(query.year),
          query.department
        );
        send(res, 200, "Monthly attendance report retrieved successfully", data);
        return;
      }

      if (subType === "summary") {
        const data = await getTeamSummaryReportService(
          requireIsoDate(query.start_date, "start_date"),
          requireIsoDate(query.end_date, "end_date"),
          query.team_id
        );
        send(res, 200, "Team summary attendance report retrieved successfully", data);
        return;
      }

      throw Object.assign(new Error("Unsupported sub_type for attendance report"), { status: 422 });
    }

    // ── leaves ────────────────────────────────────────────────────────────────
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

    // ── overtime ──────────────────────────────────────────────────────────────
    if (type === "overtime") {
      const page = toInt(query.page ?? 1);
      const limit = toInt(query.limit ?? 10);
      const filters = {};
      if (query.employee_id) filters.employee_id = query.employee_id;
      if (query.status) filters.status = query.status;
      if (query.manager_status) filters.manager_status = query.manager_status;
      if (query.hr_status) filters.hr_status = query.hr_status;

      const data = await getOvertimeRequestsService(filters, page, limit);
      send(res, 200, "Overtime report retrieved successfully", data.data, data.pagination);
      return;
    }

    // ── shifts ────────────────────────────────────────────────────────────────
    if (type === "shifts") {
      const data = await getShiftsService({
        page: toInt(query.page ?? 1),
        limit: toInt(query.limit ?? 10),
        ...(query.is_active !== undefined ? { is_active: query.is_active } : {}),
      });
      send(res, 200, "Shifts report retrieved successfully", data.data, data.pagination);
      return;
    }

    // ── shift assignments ─────────────────────────────────────────────────────
    if (type === "assignments") {
      const data = await getAssignmentsService({
        page: toInt(query.page ?? 1),
        limit: toInt(query.limit ?? 10),
        ...(query.employee_id ? { employee_id: query.employee_id } : {}),
        ...(query.shift_id ? { shift_id: query.shift_id } : {}),
        ...(query.is_active !== undefined ? { is_active: query.is_active } : {}),
      });
      send(res, 200, "Shift assignments report retrieved successfully", data.data, data.pagination);
      return;
    }

    // ── shift change requests ─────────────────────────────────────────────────
    if (type === "shift_requests") {
      const page = toInt(query.page ?? 1);
      const limit = toInt(query.limit ?? 10);
      const filters = {};
      if (query.employee_id) filters.employee_id = query.employee_id;
      if (query.status) filters.status = query.status;

      const data = await getShiftChangeRequestsService(filters, page, limit);
      send(res, 200, "Shift change requests report retrieved successfully", data.data, data.pagination);
      return;
    }

    // ── late regularization ───────────────────────────────────────────────────
    if (type === "late_regularization") {
      // listLateRegularizationsService scopes by role internally; pass admin auth id
      const lrQuery = {
        page: query.page ?? 1,
        limit: query.limit ?? 10,
        ...(query.employee_id ? { employee_id: query.employee_id } : {}),
        ...(query.attendance_id ? { attendance_id: query.attendance_id } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.regularization_type ? { type: query.regularization_type } : {}),
        ...(query.start_date ? { start_date: requireIsoDate(query.start_date, "start_date") } : {}),
        ...(query.end_date ? { end_date: requireIsoDate(query.end_date, "end_date") } : {}),
      };
      const data = await listLateRegularizationsService(req.user.id, lrQuery);
      send(res, 200, "Late regularization report retrieved successfully", data.data, data.pagination);
      return;
    }

    throw Object.assign(new Error("Unsupported report_type"), { status: 422 });
  } catch (err) {
    next(err);
  }
};
