import Joi from "joi";
export const strictObject = (shape) => Joi.object(shape).options({ allowUnknown: false });
export const uuidRule = Joi.string().trim().guid({ version: ["uuidv4", "uuidv5"] }).messages({
    "string.guid": "Must be a valid UUID",
});
export const emailRule = Joi.string().trim().email();
export const passwordRule = Joi.string().min(8).max(64);
export const isoDateRule = Joi.date().iso();
export const pageRule = Joi.number().integer().min(1).default(1);
export const limitRule = Joi.number().integer().min(1).max(100).default(10);
export const sortOrderRule = Joi.string().trim().valid("asc", "desc").default("desc");
export const timeHHmmRule = Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).messages({
    "string.pattern.base": "Time must be in HH:mm format (24-hour)",
});
export const parseFriendlyDate = (value) => {
    if (!value)
        return null;
    if (value instanceof Date)
        return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value !== "string")
        return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value))
        return new Date(value);
    const match = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
    return match ? new Date(`${match[3]}-${match[2]}-${match[1]}`) : new Date(value);
};
export const isEndDateBeforeStart = (start, end) => new Date(end) < new Date(start);
const toClockMinutes = (time) => {
    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute;
};
export const hasSameTime = (start, end) => {
    return toClockMinutes(end) === toClockMinutes(start);
};
export const hasInvalidTimeRange = (start, end) => {
    return toClockMinutes(end) <= toClockMinutes(start);
};
//# sourceMappingURL=common.validator.js.map