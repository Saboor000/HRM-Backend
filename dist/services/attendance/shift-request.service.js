import { supabase } from "../../config/supabase.js";
import { employeeByAuth, getEmployeeCurrentShiftService } from "./assignment.service.js";
import { getShiftByIdService } from "./shift.service.js";
const error = (status, message) => Object.assign(new Error(message), { status });
const SHIFT_REQUEST_SELECT = `
  *,
  employee:employee_id(id, first_name, last_name),
  current_shift:current_shift_id(id, name, start_time, end_time),
  requested_shift:requested_shift_id(id, name, start_time, end_time)
`;
const toPagination = (page, limit, count) => ({
    page,
    limit,
    total: count || 0,
    pages: Math.ceil((count || 0) / limit),
});
const applyExactFilters = (query, filters, keys) => keys.reduce((acc, key) => (filters[key] ? acc.eq(key, filters[key]) : acc), query);
const ensurePendingStatus = (entity, action) => {
    if (entity.status !== "pending") {
        throw error(400, `Cannot ${action} a ${entity.status} request`);
    }
};
const updateShiftRequestStatus = async (id, approverId, status) => {
    const { data, error: err } = await supabase
        .from("shift_change_requests")
        .update({
        status,
        approved_by: approverId,
        approved_at: new Date().toISOString(),
    })
        .eq("id", id)
        .select(SHIFT_REQUEST_SELECT)
        .single();
    if (err)
        throw error(400, err.message);
    return data;
};
const updateShiftRequestCancellation = async (id) => {
    const { data, error: err } = await supabase
        .from("shift_change_requests")
        .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
    })
        .eq("id", id)
        .select(SHIFT_REQUEST_SELECT)
        .single();
    if (err)
        throw error(400, err.message);
    return data;
};
const normalizeDateOnly = (value, fieldName = "date") => {
    if (!value) {
        throw error(422, `${fieldName} is required`);
    }
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            throw error(422, `Invalid ${fieldName}`);
        }
        return value.toISOString().split("T")[0];
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            return trimmed;
        }
        const parsed = new Date(trimmed);
        if (Number.isNaN(parsed.getTime())) {
            throw error(422, `Invalid ${fieldName}`);
        }
        return parsed.toISOString().split("T")[0];
    }
    throw error(422, `Invalid ${fieldName}`);
};
export const createShiftChangeRequestService = async (userId, payload) => {
    try {
        const employee = await employeeByAuth(userId);
        const normalizedRequestDate = normalizeDateOnly(payload.request_date, "request_date");
        const assignedShift = await getEmployeeCurrentShiftService(employee.id, normalizedRequestDate);
        if (!assignedShift?.shift_id || !assignedShift?.shift) {
            throw error(400, "No current shift assignment found for the selected date");
        }
        if (!assignedShift.shift.is_active) {
            throw error(400, "Current shift is inactive for the selected date");
        }
        if (assignedShift.shift_id !== payload.current_shift_id) {
            throw error(400, "Provided current_shift_id does not match your assigned shift for the selected date");
        }
        const requestedShift = await getShiftByIdService(payload.requested_shift_id);
        if (!requestedShift.is_active) {
            throw error(400, "Requested shift is inactive");
        }
        const { data: existing, error: existErr } = await supabase
            .from("shift_change_requests")
            .select("id")
            .eq("employee_id", employee.id)
            .eq("request_date", normalizedRequestDate)
            .eq("status", "pending")
            .maybeSingle();
        if (existErr)
            throw error(400, existErr.message);
        if (existing) {
            throw error(400, "Pending request already exists for this date");
        }
        const { data, error: err } = await supabase
            .from("shift_change_requests")
            .insert({
            employee_id: employee.id,
            current_shift_id: assignedShift.shift_id,
            requested_shift_id: payload.requested_shift_id,
            request_date: normalizedRequestDate,
            reason: payload.reason || null,
            status: "pending",
            requested_at: new Date().toISOString(),
        })
            .select(SHIFT_REQUEST_SELECT)
            .single();
        if (err)
            throw error(400, err.message);
        return data;
    }
    catch (e) {
        if (e.status)
            throw e;
        throw error(400, e.message);
    }
};
export const approveShiftChangeRequestService = async (id, userId) => {
    try {
        const approver = await employeeByAuth(userId);
        const request = await getShiftChangeRequestByIdService(id);
        ensurePendingStatus(request, "approve");
        return updateShiftRequestStatus(id, approver.id, "approved");
    }
    catch (e) {
        if (e.status)
            throw e;
        throw error(400, e.message);
    }
};
export const rejectShiftChangeRequestService = async (id, userId) => {
    try {
        const approver = await employeeByAuth(userId);
        const request = await getShiftChangeRequestByIdService(id);
        ensurePendingStatus(request, "reject");
        return updateShiftRequestStatus(id, approver.id, "rejected");
    }
    catch (e) {
        if (e.status)
            throw e;
        throw error(400, e.message);
    }
};
export const cancelShiftChangeRequestService = async (id, userId) => {
    try {
        const requester = await employeeByAuth(userId);
        const request = await getShiftChangeRequestByIdService(id);
        if (request.employee_id !== requester.id) {
            throw error(403, "You can only cancel your own shift change request");
        }
        ensurePendingStatus(request, "cancel");
        return updateShiftRequestCancellation(id);
    }
    catch (e) {
        if (e.status)
            throw e;
        throw error(400, e.message);
    }
};
export const getShiftChangeRequestsService = async (filters, page, limit) => {
    try {
        let query = supabase
            .from("shift_change_requests")
            .select(SHIFT_REQUEST_SELECT, { count: "exact" });
        query = applyExactFilters(query, filters, ["employee_id", "status"]);
        const { data, error: err, count } = await query
            .order("created_at", { ascending: false })
            .range((page - 1) * limit, page * limit - 1);
        if (err)
            throw error(400, err.message);
        return {
            data,
            pagination: toPagination(page, limit, count),
        };
    }
    catch (e) {
        if (e.status)
            throw e;
        throw error(400, e.message);
    }
};
export const getShiftChangeRequestByIdService = async (id) => {
    try {
        const { data, error: err } = await supabase
            .from("shift_change_requests")
            .select(SHIFT_REQUEST_SELECT)
            .eq("id", id)
            .single();
        if (err && err.code === "PGRST116") {
            throw error(404, "Shift change request not found");
        }
        if (err)
            throw error(400, err.message);
        return data;
    }
    catch (e) {
        if (e.status)
            throw e;
        throw error(400, e.message);
    }
};
//# sourceMappingURL=shift-request.service.js.map