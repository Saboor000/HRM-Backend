export const error = (status, message) => Object.assign(new Error(message), { status });
export const toDateOnly = (d) => {
    // Handle string dates (e.g., "2026-04-22")
    if (typeof d === "string") {
        return d.split("T")[0]; // Remove time portion if present
    }
    // Handle Date objects
    if (d instanceof Date) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }
    // Return null or empty string for invalid input
    return null;
};
export const round2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
export const normalizeNumeric = (value) => round2(Number(value || 0));
export const dateParts = (dateValue) => {
    if (dateValue instanceof Date)
        return dateValue;
    if (typeof dateValue === "string")
        return new Date(dateValue);
    return null;
};
const WEEKDAY_NAME_TO_INDEX = {
    sun: 0,
    sunday: 0,
    mon: 1,
    monday: 1,
    tue: 2,
    tuesday: 2,
    wed: 3,
    wednesday: 3,
    thu: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6,
};
const parseList = (value) => {
    if (Array.isArray(value))
        return value;
    if (typeof value === "string")
        return value.split(",").map((s) => s.trim()).filter(Boolean);
    return [];
};
const toDayIndex = (value) => {
    if (typeof value === "number" && value >= 0 && value <= 6)
        return value;
    if (typeof value === "string") {
        const trimmed = value.trim().toLowerCase();
        if (/^[0-6]$/.test(trimmed))
            return Number(trimmed);
        if (WEEKDAY_NAME_TO_INDEX[trimmed] !== undefined)
            return WEEKDAY_NAME_TO_INDEX[trimmed];
    }
    return null;
};
const parseDayIndexSet = (value, fallback = [0, 6]) => {
    const parsed = parseList(value)
        .map(toDayIndex)
        .filter((day) => day !== null);
    return new Set(parsed.length ? parsed : fallback);
};
const toDateSet = (value) => {
    return new Set(parseList(value)
        .map((entry) => {
        const parsed = dateParts(entry);
        return parsed ? toDateOnly(parsed) : null;
    })
        .filter(Boolean));
};
const getAttendanceCalendarConfig = (attendanceRules = {}) => {
    const weeklyOffDays = parseDayIndexSet(attendanceRules.weekly_off_days ?? process.env.PAYROLL_WEEKLY_OFF_DAYS, [0, 6]);
    const workingWeekendDates = toDateSet(attendanceRules.working_weekend_dates ?? process.env.PAYROLL_WORKING_WEEKEND_DATES);
    const holidayDates = toDateSet(attendanceRules.holiday_dates ?? process.env.PAYROLL_HOLIDAY_DATES);
    const forcedWorkingDates = toDateSet(attendanceRules.forced_working_dates ?? process.env.PAYROLL_FORCED_WORKING_DATES);
    const manualOffDates = toDateSet(attendanceRules.manual_off_dates ?? process.env.PAYROLL_MANUAL_OFF_DATES);
    return {
        weeklyOffDays,
        workingWeekendDates,
        holidayDates,
        forcedWorkingDates,
        manualOffDates,
    };
};
export const classifyBusinessDate = (dateValue, attendanceRules = {}) => {
    const date = dateParts(dateValue);
    if (!date)
        return { isWorkingDay: false, reason: "invalid_date" };
    const dateOnly = toDateOnly(date);
    const cfg = getAttendanceCalendarConfig(attendanceRules);
    const dayIndex = date.getDay();
    if (cfg.forcedWorkingDates.has(dateOnly)) {
        return { isWorkingDay: true, reason: "forced_working_date" };
    }
    if (cfg.holidayDates.has(dateOnly)) {
        return { isWorkingDay: false, reason: "holiday" };
    }
    if (cfg.manualOffDates.has(dateOnly)) {
        return { isWorkingDay: false, reason: "manual_off" };
    }
    if (cfg.weeklyOffDays.has(dayIndex)) {
        if (cfg.workingWeekendDates.has(dateOnly)) {
            return { isWorkingDay: true, reason: "weekend_override_working" };
        }
        return { isWorkingDay: false, reason: "weekly_off" };
    }
    return { isWorkingDay: true, reason: "regular_workday" };
};
export const isBusinessDay = (dateValue, attendanceRules = {}) => {
    return classifyBusinessDate(dateValue, attendanceRules).isWorkingDay;
};
export const getPeriodBounds = (month, year, attendanceRules = {}) => {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    const workingDates = [];
    const nonWorkingDates = [];
    const cursor = new Date(start);
    while (cursor <= end) {
        const dateOnly = toDateOnly(cursor);
        const classification = classifyBusinessDate(cursor, attendanceRules);
        if (classification.isWorkingDay) {
            workingDates.push(dateOnly);
        }
        else {
            nonWorkingDates.push({ date: dateOnly, reason: classification.reason });
        }
        cursor.setDate(cursor.getDate() + 1);
    }
    return {
        start,
        end,
        startDate: toDateOnly(start),
        endDate: toDateOnly(end),
        workingDates,
        nonWorkingDates,
        workingDays: workingDates.length,
    };
};
export const getComponentAmount = (component, baseValues) => {
    if (!component)
        return 0;
    if (component.type === "percentage") {
        const basis = component.basis === "gross_salary" ? baseValues.gross_salary : baseValues.basic_salary;
        return round2((basis * Number(component.value || 0)) / 100);
    }
    return round2(Number(component.value || 0));
};
export const getComponentTotal = (components, baseValues) => round2((components || []).reduce((sum, component) => sum + getComponentAmount(component, baseValues), 0));
export const DEFAULT_WORK_HOURS_PER_DAY = 8;
export const DEFAULT_OVERTIME_RATE_MULTIPLIER = 1.5;
export const LATE_ARRIVAL_PENALTY_STEP = 3;
export const DEFAULT_POLICY_TIMEZONE = "Asia/Karachi";
//# sourceMappingURL=payroll.utils.js.map