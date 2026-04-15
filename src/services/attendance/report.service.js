import { supabase } from "../../config/supabase.js";

const error = (status, message) => Object.assign(new Error(message), { status });

const PRESENT_STATUSES = new Set(["online", "offline", "PRESENT", "ON_LEAVE_WORKING"]);
const ABSENT_STATUSES = new Set(["absent", "ABSENT"]);
const LEAVE_STATUSES = new Set(["leave", "ON_LEAVE"]);

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

const leaveDates = (leave) =>
  leave.leave_type === "full_day" ? dateRange(leave.start_date, leave.end_date) : [leave.start_date];

const filterLeaveRecordsAlreadyInAttendance = (attendanceData, leaveData) => {
  const attendanceLeaveKeys = new Set(
    attendanceData
      .filter((record) => LEAVE_STATUSES.has(record.status))
      .map((record) => `${record.employee_id}|${record.date}`)
  );

  return leaveData.filter(
    (leave) => !leaveDates(leave).some((date) => attendanceLeaveKeys.has(`${leave.employee_id}|${date}`))
  );
};

export const getDailyAttendanceReportService = async (date, department) => {
  try {
    let queryAttendance = supabase.from("attendance_records").select(
      `
      *,
      employee:employee_id(id, first_name, last_name, designation, department),
      shift:shifts(id, name, start_time, end_time, duration_hours)
    `,
      { count: "exact" }
    );

    queryAttendance = queryAttendance.eq("date", date);

    if (department) {
      queryAttendance = queryAttendance.filter("employee.department", "eq", department);
    }

    const { data: attendanceData, error: attendanceErr } = await queryAttendance.order("created_at", {
      ascending: false,
    });

    if (attendanceErr) throw error(400, attendanceErr.message);

    let queryLeaves = supabase
      .from("leaves")
      .select(
        `
        *,
        employee:employee_id(id, first_name, last_name, designation, department)
      `
      )
      .eq("status", "approved")
      .or(
        `and(leave_type.eq.full_day,start_date.lte.${date},end_date.gte.${date}),` +
          `and(leave_type.eq.half_day,start_date.eq.${date}),` +
          `and(leave_type.eq.short_leave,start_date.eq.${date})`
      );

    if (department) {
      queryLeaves = queryLeaves.filter("employee.department", "eq", department);
    }

    const { data: leaveData, error: leaveErr } = await queryLeaves;
    if (leaveErr) throw error(400, leaveErr.message);

    const visibleLeaveData = filterLeaveRecordsAlreadyInAttendance(attendanceData, leaveData);

    const allRecords = [
      ...attendanceData.map((r) => ({ ...r, type: "attendance" })),
      ...visibleLeaveData.map((l) => ({ ...l, type: "leave" })),
    ];

    const summary = {
      total_employees: new Set([
        ...attendanceData.map((r) => r.employee_id),
        ...visibleLeaveData.map((l) => l.employee_id),
      ]).size,
      present: attendanceData.filter((r) => PRESENT_STATUSES.has(r.status)).length,
      absent: attendanceData.filter((r) => ABSENT_STATUSES.has(r.status)).length,
      on_leave: attendanceData.filter((r) => LEAVE_STATUSES.has(r.status)).length + visibleLeaveData.length,
      on_holiday: attendanceData.filter((r) => r.status === "holiday").length,
    };

    return { date, summary, records: allRecords };
  } catch (e) {
    if (e.status) throw e;
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
      .select(
        `
        *,
        employee:employee_id(id, first_name, last_name, designation, department),
        shift:shifts(id, name, start_time, end_time, duration_hours)
      `
      )
      .gte("date", startDateStr)
      .lte("date", endDateStr)
      .order("date", { ascending: true });

    if (attendanceErr) throw error(400, attendanceErr.message);

    const { data: leaveData, error: leaveErr } = await supabase
      .from("leaves")
      .select("*")
      .eq("status", "approved")
      .gte("end_date", startDateStr)
      .lte("start_date", endDateStr)
      .order("start_date", { ascending: true });

    if (leaveErr) throw error(400, leaveErr.message);

    const visibleLeaveData = filterLeaveRecordsAlreadyInAttendance(attendanceData, leaveData);

    const groupedByEmployee = {};
    attendanceData.forEach((record) => {
      if (!groupedByEmployee[record.employee_id]) {
        groupedByEmployee[record.employee_id] = {
          employee: record.employee,
          days: [],
        };
      }
      groupedByEmployee[record.employee_id].days.push({
        ...record,
        type: "attendance",
      });
    });

    visibleLeaveData.forEach((leave) => {
      if (!groupedByEmployee[leave.employee_id]) {
        groupedByEmployee[leave.employee_id] = {
          employee: null,
          days: [],
        };
      }
      groupedByEmployee[leave.employee_id].days.push({
        ...leave,
        type: "leave",
      });
    });

    return {
      week_of: startDateStr,
      week_end: endDateStr,
      year,
      total_records: attendanceData.length + visibleLeaveData.length,
      records_by_employee: groupedByEmployee,
    };
  } catch (e) {
    if (e.status) throw e;
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
      .select(
        `
        *,
        employee:employee_id(id, first_name, last_name, designation, department),
        shift:shifts(id, name, start_time, end_time, duration_hours)
      `,
        { count: "exact" }
      )
      .gte("date", startDateStr)
      .lte("date", endDateStr);

    if (department) {
      queryAttendance = queryAttendance.filter("employee.department", "eq", department);
    }

    const { data: attendanceData, error: attendanceErr } = await queryAttendance.order("date", {
      ascending: true,
    });

    if (attendanceErr) throw error(400, attendanceErr.message);

    let queryLeaves = supabase
      .from("leaves")
      .select(
        `
        *,
        employee:employee_id(id, first_name, last_name, designation, department)
      `
      )
      .eq("status", "approved")
      .gte("end_date", startDateStr)
      .lte("start_date", endDateStr);

    if (department) {
      queryLeaves = queryLeaves.filter("employee.department", "eq", department);
    }

    const { data: leaveData, error: leaveErr } = await queryLeaves.order("start_date", {
      ascending: true,
    });

    if (leaveErr) throw error(400, leaveErr.message);

    const visibleLeaveData = filterLeaveRecordsAlreadyInAttendance(attendanceData, leaveData);

    const allRecords = [
      ...attendanceData.map((r) => ({ ...r, type: "attendance" })),
      ...visibleLeaveData.map((l) => ({ ...l, type: "leave" })),
    ];

    const summary = {
      total_records: allRecords.length,
      present: attendanceData.filter((r) => PRESENT_STATUSES.has(r.status)).length,
      absent: attendanceData.filter((r) => ABSENT_STATUSES.has(r.status)).length,
      on_leave: attendanceData.filter((r) => LEAVE_STATUSES.has(r.status)).length + visibleLeaveData.length,
      on_holiday: attendanceData.filter((r) => r.status === "holiday").length,
      total_working_days: new Set(attendanceData.map((r) => r.date)).size,
    };

    return { month, year, summary, records: allRecords };
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const getTeamSummaryReportService = async (startDate, endDate, teamId) => {
  try {
    let queryAttendance = supabase
      .from("attendance_records")
      .select(
        `
        *,
        employee:employee_id(id, first_name, last_name, designation, department),
        shift:shifts(id, name, start_time, end_time, duration_hours)
      `,
        { count: "exact" }
      )
      .gte("date", startDate)
      .lte("date", endDate);

    if (teamId) {
      queryAttendance = queryAttendance.filter("employee.department", "eq", teamId);
    }

    const { data: attendanceData, error: attendanceErr } = await queryAttendance.order("employee_id", {
      ascending: true,
    });

    if (attendanceErr) throw error(400, attendanceErr.message);

    let queryLeaves = supabase
      .from("leaves")
      .select(
        `
        *,
        employee:employee_id(id, first_name, last_name, designation, department)
      `
      )
      .eq("status", "approved")
      .gte("end_date", startDate)
      .lte("start_date", endDate);

    if (teamId) {
      queryLeaves = queryLeaves.filter("employee.department", "eq", teamId);
    }

    const { data: leaveData, error: leaveErr } = await queryLeaves.order("employee_id", {
      ascending: true,
    });

    if (leaveErr) throw error(400, leaveErr.message);

    const employeeMetrics = {};
    attendanceData.forEach((record) => {
      if (record.status === "leave") return;

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

      if (PRESENT_STATUSES.has(record.status)) metrics.present_days += 1;
      if (ABSENT_STATUSES.has(record.status)) metrics.absent_days += 1;

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
        const diff =
          (new Date(leave.end_date) - new Date(leave.start_date)) /
          (1000 * 60 * 60 * 24);
        metrics.leave_days += diff + 1;
      } else if (leave.leave_type === "half_day") {
        metrics.leave_days += 0.5;
      } else if (leave.leave_type === "short_leave") {
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
        total_records: attendanceData.filter((record) => !LEAVE_STATUSES.has(record.status)).length + leaveData.length,
      },
      employee_metrics: Object.values(employeeMetrics),
    };
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};
