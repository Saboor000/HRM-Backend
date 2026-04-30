import { supabase } from "../../config/supabase.js";
import { employeeByAuth } from "./assignment.service.js";
import { getEmployeeLeavesInRange } from "./checkin-checkout.service.js";
import { evaluateAttendanceRecord, resolveEmployeeAttendancePolicy } from "./evaluated-attendance.service.js";
import { getApprovedRegularizationsForAttendanceIds, resolveEffectiveAttendanceStatus } from "./late-regularization.service.js";
import { formatTimestampInTimezone, resolveTimezone } from "../../utils/timezone.js";
const error = (status, message) => Object.assign(new Error(message), { status });
const ATTENDANCE_TIMEZONE = resolveTimezone(process.env.ATTENDANCE_TIMEZONE, process.env.PAYROLL_POLICY_TIMEZONE, "Asia/Karachi");
const ATTENDANCE_SELECT = `
  *,
  employee:employee_id(id, first_name, last_name, designation, department),
  shift:shifts(id, name, start_time, end_time, duration_hours)
`;
const LEAVE_SELECT = `
  *,
  employee:employee_id(id, first_name, last_name, designation, department)
`;
const LEAVE_ON_DATE_CONDITION = (date) => `and(leave_type.eq.full_day,start_date.lte.${date},end_date.gte.${date}),` +
    `and(leave_type.eq.half_day,start_date.eq.${date}),` +
    `and(leave_type.eq.short_leave,start_date.eq.${date})`;
const PRESENT_STATUSES = new Set(["online", "offline", "PRESENT", "ON_LEAVE_WORKING"]);
const ABSENT_STATUSES = new Set(["absent", "ABSENT"]);
const LEAVE_STATUSES = new Set(["leave", "ON_LEAVE"]);
const STATUS_FILTER_MAP = {
    PRESENT: { type: "in", values: ["online", "offline"] },
    ABSENT: { type: "eq", value: "absent" },
    ON_LEAVE: { type: "eq", value: "leave" },
    ON_HOLIDAY: { type: "eq", value: "holiday" },
    ON_LEAVE_WORKING: { type: "leave_working" },
};
const EVALUATED_STATUS_FILTER_MAP = {
    HALF_DAY: "half_day",
    OFF_DAY: "off_day",
    OFF_DAY_WORKED: "off_day_worked",
};
const getEvaluatedStatusFilter = (rawStatus) => {
    if (!rawStatus)
        return null;
    const key = String(rawStatus).trim().toUpperCase();
    return EVALUATED_STATUS_FILTER_MAP[key] || null;
};
const applyStatusFilter = (query, rawStatus) => {
    if (!rawStatus)
        return query;
    const normalized = String(rawStatus).trim();
    const key = normalized.toUpperCase();
    if (key === "ONLINE" || key === "OFFLINE" || key === "ABSENT" || key === "HOLIDAY" || key === "LEAVE" || key === "BREAK") {
        return query.eq("status", normalized.toLowerCase());
    }
    const mapped = STATUS_FILTER_MAP[key];
    if (!mapped) {
        return query.eq("status", normalized);
    }
    if (mapped.type === "in") {
        return query.in("status", mapped.values);
    }
    if (mapped.type === "leave_working") {
        return query
            .eq("leave_override", true)
            .not("check_in_time", "is", null)
            .is("check_out_time", null);
    }
    return query.eq("status", mapped.value);
};
const getRegularizationMapForAttendance = async (attendanceRows = []) => getApprovedRegularizationsForAttendanceIds((attendanceRows || []).map((row) => row?.id).filter(Boolean));
const getEffectiveStatusForRecord = (record, regularizationMap = new Map()) => resolveEffectiveAttendanceStatus(record, regularizationMap.get(record?.id) || []);
const regularizedCount = (attendanceRows = [], regularizationMap = new Map(), matcher) => attendanceRows.reduce((count, row) => {
    const effective = getEffectiveStatusForRecord(row, regularizationMap);
    const matched = typeof matcher === "function" ? matcher(effective.status) : matcher.has(effective.status);
    return matched ? count + 1 : count;
}, 0);
const withRegularizationInfo = (record, regularizationMap = new Map()) => {
    const effective = getEffectiveStatusForRecord(record, regularizationMap);
    return {
        ...record,
        effective_status: effective.status,
        regularization_applied: effective.applied,
        regularization_ids: effective.ids,
        regularization_types: effective.types,
    };
};
const dateRange = (startDate, endDate) => {
    const dates = [];
    const cursor = new Date(startDate);
    const end = new Date(endDate || startDate);
    while (cursor <= end) {
        dates.push(cursor.toISOString().split("T")[0]);
        cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
};
const leaveDates = (leave) => leave.leave_type === "full_day" ? dateRange(leave.start_date, leave.end_date) : [leave.start_date];
const filterLeaveRecordsAlreadyInAttendance = (attendanceData, leaveData) => {
    const attendanceLeaveKeys = new Set(attendanceData
        .filter((record) => LEAVE_STATUSES.has(record.status))
        .map((record) => `${record.employee_id}|${record.date}`));
    return leaveData.filter((leave) => !leaveDates(leave).some((date) => attendanceLeaveKeys.has(`${leave.employee_id}|${date}`)));
};
const applyDepartmentFilter = (query, department) => department ? query.filter("employee.department", "eq", department) : query;
const toTypedRecords = (records, type) => records.map((record) => ({ ...record, type }));
const toDateOnly = (value) => (value ? new Date(value).toISOString().split("T")[0] : value);
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const getLeaveForDate = (leaveRows = [], date) => {
    if (!date)
        return null;
    return (leaveRows.find((leave) => {
        if (leave.leave_type === "full_day") {
            return String(leave.start_date || "") <= String(date) && String(date) <= String(leave.end_date || leave.start_date || "");
        }
        return String(leave.start_date || "") === String(date);
    }) || null);
};
const withAttendanceWorkMetrics = (record) => {
    const workedHours = round2(Number(record?.duration_hours || 0));
    const shiftHours = record?.shift?.duration_hours !== undefined && record?.shift?.duration_hours !== null
        ? round2(Number(record.shift.duration_hours || 0))
        : null;
    // Remove raw late_minutes, only expose evaluation.late_minutes if present
    const { late_minutes, ...rest } = record;
    return {
        ...rest,
        worked_hours: workedHours,
        shift_hours: shiftHours,
        eligible_overtime_hours: round2(Number(record?.overtime_hours || 0)),
        attendance_timezone: ATTENDANCE_TIMEZONE,
        check_in_time_local: formatTimestampInTimezone(record?.check_in_time, ATTENDANCE_TIMEZONE),
        check_out_time_local: formatTimestampInTimezone(record?.check_out_time, ATTENDANCE_TIMEZONE),
        // Optionally, expose evaluation.late_minutes at top-level for convenience
        ...(record.evaluation && typeof record.evaluation.late_minutes === 'number'
            ? { late_minutes: record.evaluation.late_minutes }
            : {}),
    };
};
export const getDailyAttendanceReportService = async (date, department) => {
    try {
        let queryAttendance = supabase.from("attendance_records").select(ATTENDANCE_SELECT, { count: "exact" });
        queryAttendance = applyDepartmentFilter(queryAttendance.eq("date", date), department);
        const { data: attendanceData, error: attendanceErr } = await queryAttendance.order("created_at", {
            ascending: false,
        });
        if (attendanceErr)
            throw error(400, attendanceErr.message);
        let queryLeaves = supabase
            .from("leaves")
            .select(LEAVE_SELECT)
            .eq("status", "approved")
            .or(LEAVE_ON_DATE_CONDITION(date));
        queryLeaves = applyDepartmentFilter(queryLeaves, department);
        const { data: leaveData, error: leaveErr } = await queryLeaves;
        if (leaveErr)
            throw error(400, leaveErr.message);
        const visibleLeaveData = filterLeaveRecordsAlreadyInAttendance(attendanceData, leaveData);
        const regularizationMap = await getRegularizationMapForAttendance(attendanceData || []);
        const attendanceRecords = toTypedRecords(attendanceData, "attendance")
            .map((record) => withRegularizationInfo(record, regularizationMap))
            .map(withAttendanceWorkMetrics);
        const leaveRecords = toTypedRecords(visibleLeaveData, "leave").map(withAttendanceWorkMetrics);
        const allRecords = [...attendanceRecords, ...leaveRecords];
        const summary = {
            total_employees: new Set([
                ...attendanceData.map((r) => r.employee_id),
                ...visibleLeaveData.map((l) => l.employee_id),
            ]).size,
            present: regularizedCount(attendanceData, regularizationMap, PRESENT_STATUSES),
            absent: regularizedCount(attendanceData, regularizationMap, ABSENT_STATUSES),
            on_leave: regularizedCount(attendanceData, regularizationMap, LEAVE_STATUSES) + visibleLeaveData.length,
            on_holiday: regularizedCount(attendanceData, regularizationMap, (status) => status === "holiday"),
            approved_regularizations_applied: Array.from(regularizationMap.values()).reduce((sum, items) => sum + Number(items.length || 0), 0),
        };
        return { date, summary, records: allRecords };
    }
    catch (e) {
        if (e.status)
            throw e;
        throw error(400, e.message);
    }
};
export const getWeeklyAttendanceReportService = async (weekOf, year) => {
    try {
        const startDate = new Date(weekOf);
        const dayOfWeek = startDate.getDay();
        startDate.setDate(startDate.getDate() - dayOfWeek);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);
        const startDateStr = startDate.toISOString().split("T")[0];
        const endDateStr = endDate.toISOString().split("T")[0];
        const { data: attendanceData, error: attendanceErr } = await supabase
            .from("attendance_records")
            .select(ATTENDANCE_SELECT)
            .gte("date", startDateStr)
            .lte("date", endDateStr)
            .order("date", { ascending: true });
        if (attendanceErr)
            throw error(400, attendanceErr.message);
        const { data: leaveData, error: leaveErr } = await supabase
            .from("leaves")
            .select(LEAVE_SELECT)
            .eq("status", "approved")
            .eq("is_paid", true)
            .gte("end_date", startDateStr)
            .lte("start_date", endDateStr)
            .order("start_date", { ascending: true });
        if (leaveErr)
            throw error(400, leaveErr.message);
        const visibleLeaveData = filterLeaveRecordsAlreadyInAttendance(attendanceData, leaveData);
        const regularizationMap = await getRegularizationMapForAttendance(attendanceData || []);
        const groupedByEmployee = {};
        attendanceData.forEach((record) => {
            if (!groupedByEmployee[record.employee_id]) {
                groupedByEmployee[record.employee_id] = {
                    employee: record.employee,
                    days: [],
                };
            }
            groupedByEmployee[record.employee_id].days.push(withAttendanceWorkMetrics({
                ...withRegularizationInfo(record, regularizationMap),
                type: "attendance",
            }));
        });
        visibleLeaveData.forEach((leave) => {
            if (!groupedByEmployee[leave.employee_id]) {
                groupedByEmployee[leave.employee_id] = {
                    employee: null,
                    days: [],
                };
            }
            groupedByEmployee[leave.employee_id].days.push(withAttendanceWorkMetrics({
                ...leave,
                type: "leave",
            }));
        });
        return {
            week_of: startDateStr,
            week_end: endDateStr,
            year,
            total_records: attendanceData.length + visibleLeaveData.length,
            records_by_employee: groupedByEmployee,
        };
    }
    catch (e) {
        if (e.status)
            throw e;
        throw error(400, e.message);
    }
};
export const getMonthlyAttendanceReportService = async (month, year, department) => {
    try {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        const startDateStr = startDate.toISOString().split("T")[0];
        const endDateStr = endDate.toISOString().split("T")[0];
        let queryAttendance = supabase
            .from("attendance_records")
            .select(ATTENDANCE_SELECT, { count: "exact" })
            .gte("date", startDateStr)
            .lte("date", endDateStr);
        queryAttendance = applyDepartmentFilter(queryAttendance, department);
        const { data: attendanceData, error: attendanceErr } = await queryAttendance.order("date", {
            ascending: true,
        });
        if (attendanceErr)
            throw error(400, attendanceErr.message);
        let queryLeaves = supabase
            .from("leaves")
            .select(LEAVE_SELECT)
            .eq("status", "approved")
            .eq("is_paid", true)
            .gte("end_date", startDateStr)
            .lte("start_date", endDateStr);
        queryLeaves = applyDepartmentFilter(queryLeaves, department);
        const { data: leaveData, error: leaveErr } = await queryLeaves.order("start_date", {
            ascending: true,
        });
        if (leaveErr)
            throw error(400, leaveErr.message);
        const visibleLeaveData = filterLeaveRecordsAlreadyInAttendance(attendanceData, leaveData);
        const regularizationMap = await getRegularizationMapForAttendance(attendanceData || []);
        const attendanceRecords = toTypedRecords(attendanceData, "attendance")
            .map((record) => withRegularizationInfo(record, regularizationMap))
            .map(withAttendanceWorkMetrics);
        const leaveRecords = toTypedRecords(visibleLeaveData, "leave").map(withAttendanceWorkMetrics);
        const allRecords = [...attendanceRecords, ...leaveRecords];
        const summary = {
            total_records: allRecords.length,
            present: regularizedCount(attendanceData, regularizationMap, PRESENT_STATUSES),
            absent: regularizedCount(attendanceData, regularizationMap, ABSENT_STATUSES),
            on_leave: regularizedCount(attendanceData, regularizationMap, LEAVE_STATUSES) + visibleLeaveData.length,
            on_holiday: regularizedCount(attendanceData, regularizationMap, (status) => status === "holiday"),
            total_working_days: new Set(attendanceData.map((r) => r.date)).size,
            approved_regularizations_applied: Array.from(regularizationMap.values()).reduce((sum, items) => sum + Number(items.length || 0), 0),
        };
        return { month, year, summary, records: allRecords };
    }
    catch (e) {
        if (e.status)
            throw e;
        throw error(400, e.message);
    }
};
export const getTeamSummaryReportService = async (startDate, endDate, teamId) => {
    try {
        let queryAttendance = supabase
            .from("attendance_records")
            .select(ATTENDANCE_SELECT, { count: "exact" })
            .gte("date", startDate)
            .lte("date", endDate);
        queryAttendance = applyDepartmentFilter(queryAttendance, teamId);
        const { data: attendanceData, error: attendanceErr } = await queryAttendance.order("employee_id", {
            ascending: true,
        });
        if (attendanceErr)
            throw error(400, attendanceErr.message);
        let queryLeaves = supabase
            .from("leaves")
            .select(LEAVE_SELECT)
            .eq("status", "approved")
            .eq("is_paid", true)
            .gte("end_date", startDate)
            .lte("start_date", endDate);
        queryLeaves = applyDepartmentFilter(queryLeaves, teamId);
        const { data: leaveData, error: leaveErr } = await queryLeaves.order("employee_id", {
            ascending: true,
        });
        if (leaveErr)
            throw error(400, leaveErr.message);
        const regularizationMap = await getRegularizationMapForAttendance(attendanceData || []);
        const employeeMetrics = {};
        attendanceData.forEach((record) => {
            const effective = getEffectiveStatusForRecord(record, regularizationMap);
            if (LEAVE_STATUSES.has(effective.status))
                return;
            const empId = record.employee_id;
            if (!employeeMetrics[empId]) {
                employeeMetrics[empId] = {
                    id: empId,
                    name: `${record.employee.first_name} ${record.employee.last_name}`,
                    designation: record.employee.designation,
                    department: record.employee.department,
                    total_days: 0,
                    present_days: 0,
                    absent_days: 0,
                    leave_days: 0,
                    total_hours: 0,
                };
            }
            const metrics = employeeMetrics[empId];
            metrics.total_days += 1;
            if (PRESENT_STATUSES.has(effective.status))
                metrics.present_days += 1;
            if (ABSENT_STATUSES.has(effective.status))
                metrics.absent_days += 1;
            if (record.duration_hours) {
                metrics.total_hours += record.duration_hours;
            }
        });
        leaveData.forEach((leave) => {
            const empId = leave.employee_id;
            if (!employeeMetrics[empId]) {
                employeeMetrics[empId] = {
                    id: empId,
                    name: `${leave.employee.first_name} ${leave.employee.last_name}`,
                    designation: leave.employee.designation,
                    department: leave.employee.department,
                    total_days: 0,
                    present_days: 0,
                    absent_days: 0,
                    leave_days: 0,
                    total_hours: 0,
                };
            }
            const metrics = employeeMetrics[empId];
            if (leave.leave_type === "full_day") {
                const diff = (new Date(leave.end_date) - new Date(leave.start_date)) /
                    (1000 * 60 * 60 * 24);
                metrics.leave_days += diff + 1;
            }
            else if (leave.leave_type === "half_day") {
                metrics.leave_days += 0.5;
            }
            else if (leave.leave_type === "short_leave") {
                const [sh, sm] = leave.start_time.split(":").map(Number);
                const [eh, em] = leave.end_time.split(":").map(Number);
                const hours = (eh * 60 + em - (sh * 60 + sm)) / 60;
                metrics.leave_days += hours / 8;
            }
        });
        return {
            period: { start: startDate, end: endDate },
            team_id: teamId,
            summary: {
                total_employees: Object.keys(employeeMetrics).length,
                total_records: attendanceData.filter((record) => {
                    const effective = getEffectiveStatusForRecord(record, regularizationMap);
                    return !LEAVE_STATUSES.has(effective.status);
                }).length + leaveData.length,
                approved_regularizations_applied: Array.from(regularizationMap.values()).reduce((sum, items) => sum + Number(items.length || 0), 0),
            },
            employee_metrics: Object.values(employeeMetrics),
        };
    }
    catch (e) {
        if (e.status)
            throw e;
        throw error(400, e.message);
    }
};
export const getMyAttendanceReportService = async (userId, filters = {}) => {
    try {
        const employee = await employeeByAuth(userId);
        const attendancePolicy = await resolveEmployeeAttendancePolicy(employee.id);
        const page = Number.parseInt(filters.page, 10) || 1;
        const limit = Number.parseInt(filters.limit, 10) || 10;
        const from = (page - 1) * limit;
        let query = supabase
            .from("attendance_records")
            .select(ATTENDANCE_SELECT, { count: "exact" })
            .eq("employee_id", employee.id)
            .order("date", { ascending: false });
        const evaluatedStatusFilter = getEvaluatedStatusFilter(filters.status);
        if (filters.date) {
            query = query.eq("date", toDateOnly(filters.date));
        }
        if (filters.start_date) {
            query = query.gte("date", toDateOnly(filters.start_date));
        }
        if (filters.end_date) {
            query = query.lte("date", toDateOnly(filters.end_date));
        }
        if (filters.status && !evaluatedStatusFilter) {
            query = applyStatusFilter(query, filters.status);
        }
        if (filters.shift_id) {
            query = query.eq("shift_id", filters.shift_id);
        }
        let attendanceRows = [];
        let totalCount = 0;
        if (evaluatedStatusFilter) {
            const { data, error: err } = await query;
            if (err)
                throw error(400, err.message);
            attendanceRows = data || [];
            totalCount = attendanceRows.length;
        }
        else {
            const { data, error: err, count } = await query.range(from, from + limit - 1);
            if (err)
                throw error(400, err.message);
            attendanceRows = data || [];
            totalCount = count || 0;
        }
        const dates = attendanceRows.map((record) => record.date).filter(Boolean).sort();
        const startDate = filters.start_date ? toDateOnly(filters.start_date) : dates[0] || null;
        const endDate = filters.end_date ? toDateOnly(filters.end_date) : dates[dates.length - 1] || startDate;
        const leaveRows = startDate && endDate ? await getEmployeeLeavesInRange(employee.id, startDate, endDate) : [];
        const regularizationMap = await getRegularizationMapForAttendance(attendanceRows || []);
        let records = attendanceRows.map((record) => {
            const regularizations = regularizationMap.get(record.id) || [];
            const leaveRecord = getLeaveForDate(leaveRows, record.date);
            const evaluation = evaluateAttendanceRecord({
                date: record.date,
                attendanceRecord: record,
                leaveRecord,
                attendancePolicy: attendancePolicy || {},
                regularizations,
            });
            return {
                ...withAttendanceWorkMetrics(record),
                regularization_applied: regularizations.length > 0,
                regularization_ids: regularizations.map((item) => item.id),
                regularization_types: regularizations.map((item) => item.type),
                evaluation,
            };
        });
        if (evaluatedStatusFilter) {
            const filtered = records.filter((record) => String(record?.evaluation?.evaluated_status || "") === evaluatedStatusFilter);
            totalCount = filtered.length;
            records = filtered.slice(from, from + limit);
        }
        const evaluatedSummary = records.reduce((acc, record) => {
            const status = record?.evaluation?.evaluated_status;
            if (status === "present" || status === "off_day_worked")
                acc.present_days += 1;
            if (status === "half_day")
                acc.half_days += 1;
            if (status === "leave")
                acc.paid_leave_days += Number(record?.evaluation?.payable_day_fraction || 0);
            if (status === "absent")
                acc.absent_days += 1;
            if (status === "holiday")
                acc.holiday_days += 1;
            if (status === "off_day")
                acc.off_days += 1;
            if (record?.evaluation?.is_late)
                acc.late_arrivals += 1;
            return acc;
        }, {
            total_working_days: attendanceRows.length,
            present_days: 0,
            half_days: 0,
            paid_leave_days: 0,
            absent_days: 0,
            holiday_days: 0,
            off_days: 0,
            late_arrivals: 0,
        });
        const summary = {
            total_records: totalCount || 0,
            present: round2(evaluatedSummary.present_days),
            absent: round2(evaluatedSummary.absent_days),
            on_leave: round2(evaluatedSummary.paid_leave_days),
            on_holiday: round2(evaluatedSummary.holiday_days),
            total_worked_hours: Math.round(records.reduce((sum, r) => sum + Number(r.duration_hours || 0), 0) * 100) / 100,
            evaluated: {
                total_working_days: evaluatedSummary.total_working_days,
                present_days: round2(evaluatedSummary.present_days),
                half_days: round2(evaluatedSummary.half_days),
                paid_leave_days: round2(evaluatedSummary.paid_leave_days),
                absent_days: round2(evaluatedSummary.absent_days),
                holiday_days: round2(evaluatedSummary.holiday_days),
                off_days: round2(evaluatedSummary.off_days),
                payable_days: round2(evaluatedSummary.present_days + (evaluatedSummary.half_days * 0.5) + evaluatedSummary.paid_leave_days),
                late_arrivals: round2(evaluatedSummary.late_arrivals),
                approved_regularizations_applied: Array.from(regularizationMap.values()).reduce((sum, items) => sum + Number(items.length || 0), 0),
            },
        };
        return {
            employee,
            filters: {
                date: filters.date || null,
                start_date: filters.start_date || null,
                end_date: filters.end_date || null,
                status: filters.status || null,
                shift_id: filters.shift_id || null,
            },
            summary,
            records,
            pagination: {
                page,
                limit,
                total: totalCount || 0,
                pages: Math.ceil((totalCount || 0) / limit),
            },
        };
    }
    catch (e) {
        if (e.status)
            throw e;
        throw error(400, e.message);
    }
};
const toIsoDateInput = (value) => {
    if (!value)
        return null;
    if (value instanceof Date)
        return Number.isNaN(value.getTime()) ? null : value.toISOString().split("T")[0];
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().split("T")[0];
};
const defaultPeriodRange = (startDate, endDate) => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
    return {
        start_date: toIsoDateInput(startDate) || firstDay,
        end_date: toIsoDateInput(endDate) || lastDay,
    };
};
const getRequesterProfile = async (authId) => {
    const { data, error: err } = await supabase
        .from("employees")
        .select("id, auth_id, first_name, last_name, designation, department")
        .eq("auth_id", authId)
        .maybeSingle();
    if (err)
        throw error(400, err.message);
    if (!data)
        throw error(404, "Employee not found");
    return data;
};
const countQuery = async (table, builder) => {
    let query = supabase.from(table).select("id", { count: "exact", head: true });
    if (builder)
        query = builder(query);
    const { count, error: err } = await query;
    if (err)
        throw error(400, err.message);
    return count || 0;
};
const getAttendanceSummaryForRange = async (startDate, endDate, department) => {
    let query = supabase
        .from("attendance_records")
        .select(ATTENDANCE_SELECT)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });
    query = applyDepartmentFilter(query, department);
    const { data, error: err } = await query;
    if (err)
        throw error(400, err.message);
    const records = data || [];
    const regularizationMap = await getRegularizationMapForAttendance(records || []);
    const dailyMap = {};
    for (const record of records) {
        const effective = getEffectiveStatusForRecord(record, regularizationMap);
        const key = record.date;
        if (!dailyMap[key]) {
            dailyMap[key] = { date: key, present: 0, absent: 0, on_leave: 0, overtime_hours: 0 };
        }
        if (PRESENT_STATUSES.has(effective.status))
            dailyMap[key].present += 1;
        if (ABSENT_STATUSES.has(effective.status))
            dailyMap[key].absent += 1;
        if (LEAVE_STATUSES.has(effective.status))
            dailyMap[key].on_leave += 1;
        dailyMap[key].overtime_hours += Number(record.overtime_hours || 0);
    }
    return {
        records,
        summary: {
            total_records: records.length,
            present: regularizedCount(records, regularizationMap, PRESENT_STATUSES),
            absent: regularizedCount(records, regularizationMap, ABSENT_STATUSES),
            on_leave: regularizedCount(records, regularizationMap, LEAVE_STATUSES),
            on_holiday: regularizedCount(records, regularizationMap, (status) => status === "holiday"),
            overtime_hours: Math.round(records.reduce((sum, r) => sum + Number(r.overtime_hours || 0), 0) * 100) / 100,
            approved_regularizations_applied: Array.from(regularizationMap.values()).reduce((sum, items) => sum + Number(items.length || 0), 0),
        },
        daily_trend: Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)),
    };
};
const getAdminDashboardData = async ({ start_date, end_date, department }) => {
    const attendance = await getAttendanceSummaryForRange(start_date, end_date, department);
    const [totalEmployees, pendingLeaves, pendingOvertime, pendingShiftChanges, approvedLeaves, approvedOvertime, recentLeavesResult, recentOvertimeResult, recentShiftChangesResult, departmentsResult,] = await Promise.all([
        countQuery("employees"),
        countQuery("leaves", (q) => q.eq("status", "pending")),
        countQuery("overtime_requests", (q) => q.eq("status", "pending")),
        countQuery("shift_change_requests", (q) => q.eq("status", "pending")),
        countQuery("leaves", (q) => q.eq("status", "approved").gte("start_date", start_date).lte("start_date", end_date)),
        countQuery("overtime_requests", (q) => q.eq("status", "approved").gte("date", start_date).lte("date", end_date)),
        supabase.from("leaves").select(LEAVE_SELECT).order("submitted_at", { ascending: false }).limit(5),
        supabase.from("overtime_requests").select("*, employee:employee_id(id, first_name, last_name, department)").order("created_at", { ascending: false }).limit(5),
        supabase.from("shift_change_requests").select("*, employee:employee_id(id, first_name, last_name, department)").order("created_at", { ascending: false }).limit(5),
        supabase.from("employees").select("department"),
    ]);
    if (recentLeavesResult.error)
        throw error(400, recentLeavesResult.error.message);
    if (recentOvertimeResult.error)
        throw error(400, recentOvertimeResult.error.message);
    if (recentShiftChangesResult.error)
        throw error(400, recentShiftChangesResult.error.message);
    if (departmentsResult.error)
        throw error(400, departmentsResult.error.message);
    const departments = (departmentsResult.data || []).reduce((acc, row) => {
        const key = row.department || "Unknown";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    return {
        cards: {
            total_employees: totalEmployees,
            present_today: attendance.summary.present,
            absent_today: attendance.summary.absent,
            pending_approvals: pendingLeaves + pendingOvertime + pendingShiftChanges,
        },
        attendance: attendance.summary,
        approvals: {
            pending_leaves: pendingLeaves,
            pending_overtime: pendingOvertime,
            pending_shift_changes: pendingShiftChanges,
        },
        operations: {
            approved_leaves: approvedLeaves,
            approved_overtime_requests: approvedOvertime,
        },
        distribution: {
            employees_by_department: departments,
        },
        trends: {
            daily_attendance: attendance.daily_trend,
        },
        recent: {
            leaves: recentLeavesResult.data || [],
            overtime_requests: recentOvertimeResult.data || [],
            shift_change_requests: recentShiftChangesResult.data || [],
        },
    };
};
const getEmployeeDashboardData = async ({ employeeId, start_date, end_date }) => {
    const [myAttendance, pendingLeaves, pendingOvertime, pendingShiftChanges, approvedUpcomingLeaves, latestAttendance,] = await Promise.all([
        getMyAttendanceReportService(employeeId, { start_date, end_date, page: 1, limit: 100 }),
        countQuery("leaves", (q) => q.eq("employee_id", employeeId).eq("status", "pending")),
        countQuery("overtime_requests", (q) => q.eq("employee_id", employeeId).eq("status", "pending")),
        countQuery("shift_change_requests", (q) => q.eq("employee_id", employeeId).eq("status", "pending")),
        supabase
            .from("leaves")
            .select("*")
            .eq("employee_id", employeeId)
            .eq("status", "approved")
            .gte("start_date", new Date().toISOString().split("T")[0])
            .order("start_date", { ascending: true })
            .limit(5),
        supabase
            .from("attendance_records")
            .select(ATTENDANCE_SELECT)
            .eq("employee_id", employeeId)
            .order("date", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);
    if (approvedUpcomingLeaves.error)
        throw error(400, approvedUpcomingLeaves.error.message);
    if (latestAttendance.error)
        throw error(400, latestAttendance.error.message);
    return {
        cards: {
            present_days: myAttendance.summary.present,
            absent_days: myAttendance.summary.absent,
            leave_days: myAttendance.summary.on_leave,
            pending_requests: pendingLeaves + pendingOvertime + pendingShiftChanges,
        },
        attendance: myAttendance.summary,
        requests: {
            pending_leaves: pendingLeaves,
            pending_overtime: pendingOvertime,
            pending_shift_changes: pendingShiftChanges,
        },
        latest: {
            attendance: latestAttendance.data || null,
        },
        upcoming: {
            approved_leaves: approvedUpcomingLeaves.data || [],
        },
        records: myAttendance.records,
    };
};
export const getDashboardSummaryService = async ({ authId, startDate, endDate, department }) => {
    try {
        const requester = await getRequesterProfile(authId);
        const { start_date, end_date } = defaultPeriodRange(startDate, endDate);
        const role = requester.designation;
        if (["admin", "hr", "manager"].includes(role)) {
            const data = await getAdminDashboardData({ start_date, end_date, department: department || requester.department });
            return {
                role,
                period: { start_date, end_date },
                dashboard: data,
            };
        }
        const data = await getEmployeeDashboardData({ employeeId: requester.id, start_date, end_date });
        return {
            role,
            period: { start_date, end_date },
            employee: requester,
            dashboard: data,
        };
    }
    catch (e) {
        if (e.status)
            throw e;
        throw error(400, e.message);
    }
};
export const getCombinedAttendanceAnalyticsService = async ({ authId, startDate, endDate, department }) => {
    try {
        const requester = await getRequesterProfile(authId);
        const { start_date, end_date } = defaultPeriodRange(startDate, endDate);
        const role = requester.designation;
        if (["admin", "hr", "manager"].includes(role)) {
            const attendance = await getAttendanceSummaryForRange(start_date, end_date, department || requester.department);
            const [totalEmployees, leavesApproved, leavesPending, overtimeApproved, overtimePending, shiftChangesApproved, shiftChangesPending, activeShifts, shiftAssignments,] = await Promise.all([
                countQuery("employees"),
                countQuery("leaves", (q) => q.eq("status", "approved").gte("start_date", start_date).lte("start_date", end_date)),
                countQuery("leaves", (q) => q.eq("status", "pending")),
                countQuery("overtime_requests", (q) => q.eq("status", "approved").gte("date", start_date).lte("date", end_date)),
                countQuery("overtime_requests", (q) => q.eq("status", "pending")),
                countQuery("shift_change_requests", (q) => q.eq("status", "approved").gte("request_date", start_date).lte("request_date", end_date)),
                countQuery("shift_change_requests", (q) => q.eq("status", "pending")),
                countQuery("shifts", (q) => q.eq("is_active", true)),
                countQuery("employee_shift_assignments", (q) => q.eq("is_active", true)),
            ]);
            return {
                role,
                period: { start_date, end_date },
                overview: {
                    total_employees: totalEmployees,
                    total_records: attendance.summary.total_records,
                    present: attendance.summary.present,
                    absent: attendance.summary.absent,
                    on_leave: attendance.summary.on_leave,
                    overtime_hours: attendance.summary.overtime_hours,
                },
                leaves: {
                    approved: leavesApproved,
                    pending: leavesPending,
                },
                overtime: {
                    approved_requests: overtimeApproved,
                    pending_requests: overtimePending,
                },
                shift_changes: {
                    approved: shiftChangesApproved,
                    pending: shiftChangesPending,
                },
                shifts: {
                    active_shifts: activeShifts,
                    active_assignments: shiftAssignments,
                },
                trends: {
                    daily_attendance: attendance.daily_trend,
                },
            };
        }
        const myAttendance = await getMyAttendanceReportService(requester.auth_id, {
            start_date,
            end_date,
            page: 1,
            limit: 100,
        });
        const [leavesPending, overtimePending, shiftChangesPending] = await Promise.all([
            countQuery("leaves", (q) => q.eq("employee_id", requester.id).eq("status", "pending")),
            countQuery("overtime_requests", (q) => q.eq("employee_id", requester.id).eq("status", "pending")),
            countQuery("shift_change_requests", (q) => q.eq("employee_id", requester.id).eq("status", "pending")),
        ]);
        return {
            role,
            period: { start_date, end_date },
            employee: requester,
            overview: {
                total_records: myAttendance.summary.total_records,
                present: myAttendance.summary.present,
                absent: myAttendance.summary.absent,
                on_leave: myAttendance.summary.on_leave,
                total_worked_hours: myAttendance.summary.total_worked_hours,
            },
            pending_requests: {
                leaves: leavesPending,
                overtime: overtimePending,
                shift_changes: shiftChangesPending,
            },
            records: myAttendance.records,
        };
    }
    catch (e) {
        if (e.status)
            throw e;
        throw error(400, e.message);
    }
};
//# sourceMappingURL=report.service.js.map