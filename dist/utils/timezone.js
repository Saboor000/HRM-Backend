const DEFAULT_TIMEZONE = "Asia/Karachi";
const HAS_TIMEZONE_SUFFIX = /([zZ]|[+\-]\d{2}:\d{2})$/;
const getPartValue = (parts, type, fallback = "00") => parts.find((part) => part.type === type)?.value || fallback;
const parseDateValue = (value) => {
    if (value instanceof Date)
        return value;
    const raw = String(value);
    return new Date(HAS_TIMEZONE_SUFFIX.test(raw) ? raw : `${raw}Z`);
};
export const resolveTimezone = (...candidates) => candidates.find((value) => typeof value === "string" && value.trim().length > 0) || DEFAULT_TIMEZONE;
export const getDateInTimezone = (timeZone, date = new Date()) => {
    const resolved = resolveTimezone(timeZone);
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: resolved,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const year = getPartValue(parts, "year", "0000");
    const month = getPartValue(parts, "month");
    const day = getPartValue(parts, "day");
    return `${year}-${month}-${day}`;
};
export const formatTimestampInTimezone = (value, timeZone) => {
    if (!value)
        return null;
    const parsed = parseDateValue(value);
    if (Number.isNaN(parsed.getTime()))
        return null;
    const resolved = resolveTimezone(timeZone);
    try {
        const parts = new Intl.DateTimeFormat("sv-SE", {
            timeZone: resolved,
            hour12: false,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        }).formatToParts(parsed);
        return `${getPartValue(parts, "year", "0000")}-${getPartValue(parts, "month")}-${getPartValue(parts, "day")}T${getPartValue(parts, "hour")}:${getPartValue(parts, "minute")}:${getPartValue(parts, "second")}`;
    }
    catch {
        return parsed.toISOString();
    }
};
export const toClockMinutesInTimezone = (value, timeZone) => {
    if (!value)
        return null;
    // HH:mm or HH:mm:ss input is interpreted directly as local clock time.
    if (typeof value === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(value)) {
        const [hour, minute] = value.split(":").map(Number);
        return hour * 60 + minute;
    }
    const parsed = parseDateValue(value);
    if (Number.isNaN(parsed.getTime()))
        return null;
    const resolved = resolveTimezone(timeZone);
    try {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: resolved,
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
        }).formatToParts(parsed);
        const hour = Number(getPartValue(parts, "hour", "0"));
        const minute = Number(getPartValue(parts, "minute", "0"));
        return hour * 60 + minute;
    }
    catch {
        return parsed.getUTCHours() * 60 + parsed.getUTCMinutes();
    }
};
//# sourceMappingURL=timezone.js.map