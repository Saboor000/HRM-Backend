import { supabase } from "../../config/supabase.js";

const error = (status, message) => Object.assign(new Error(message), { status });
const nowIso = () => new Date().toISOString();
const updateShiftById = async (id, payload) => {
  const { data, error: err } = await supabase
    .from("shifts")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (err) throw error(400, err.message);
  return data;
};

export const validateShiftTiming = (startTime, endTime) => {
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

  if (!timeRegex.test(startTime)) {
    throw error(400, "Invalid start_time format. Use HH:MM (24-hour)");
  }

  if (!timeRegex.test(endTime)) {
    throw error(400, "Invalid end_time format. Use HH:MM (24-hour)");
  }

  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);

  const startTotalMinutes = startH * 60 + startM;
  const endTotalMinutes = endH * 60 + endM;

  if (endTotalMinutes === startTotalMinutes) {
    throw error(400, "Start time and end time cannot be the same");
  }

  return true;
};

export const calculateDurationHours = (startTime, endTime) => {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);

  const startTotalMinutes = startH * 60 + startM;
  const endTotalMinutes = endH * 60 + endM;

  const durationMinutes =
    endTotalMinutes > startTotalMinutes
      ? endTotalMinutes - startTotalMinutes
      : 24 * 60 - startTotalMinutes + endTotalMinutes;
  const durationHours = durationMinutes / 60;

  return Math.round(durationHours * 100) / 100;
};

const validateDurationHours = (providedDuration, startTime, endTime) => {
  const expectedDuration = calculateDurationHours(startTime, endTime);
  const roundedProvidedDuration = Math.round(Number(providedDuration) * 100) / 100;

  if (Number.isNaN(roundedProvidedDuration)) {
    throw error(400, "duration_hours must be a valid number");
  }

  if (Math.abs(roundedProvidedDuration - expectedDuration) > 0.01) {
    throw error(
      400,
      `duration_hours must match shift timing. Expected ${expectedDuration} for ${startTime} to ${endTime}`
    );
  }
};

export const createShiftService = async (payload) => {
  try {
    validateShiftTiming(payload.start_time, payload.end_time);
    validateDurationHours(payload.duration_hours, payload.start_time, payload.end_time);

    const { data, error: err } = await supabase
      .from("shifts")
      .insert({
        name: payload.name,
        start_time: payload.start_time,
        end_time: payload.end_time,
        duration_hours: payload.duration_hours,
        is_active: true,
      })
      .select("*")
      .single();

    if (err) throw error(400, err.message);
    return data;
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

const toPagination = (page, limit, count) => ({
  page,
  limit,
  total: count || 0,
  pages: Math.ceil((count || 0) / limit),
});

export const getShiftsService = async (query = {}) => {
  try {
    const { page = 1, limit = 10, is_active } = query;
    const from = (page - 1) * limit;

    let q = supabase
      .from("shifts")
      .select("*", { count: "exact" })
      .order("start_time", { ascending: true });

    if (is_active !== undefined) {
      q = q.eq("is_active", is_active);
    }

    const { data, error: err, count } = await q.range(from, from + limit - 1);

    if (err) throw error(400, err.message);
    return {
      data: data || [],
      pagination: toPagination(page, limit, count),
    };
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const getShiftByIdService = async (id) => {
  try {
    const { data, error: err } = await supabase
      .from("shifts")
      .select("*")
      .eq("id", id)
      .single();

    if (err && err.code === "PGRST116") {
      throw error(404, "Shift not found");
    }
    if (err) throw error(400, err.message);

    return data;
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const updateShiftService = async (id, payload) => {
  try {
    const currentShift = await getShiftByIdService(id);

    const effectiveStartTime = payload.start_time ?? currentShift.start_time;
    const effectiveEndTime = payload.end_time ?? currentShift.end_time;

    validateShiftTiming(effectiveStartTime, effectiveEndTime);

    if (
      payload.duration_hours !== undefined ||
      payload.start_time !== undefined ||
      payload.end_time !== undefined
    ) {
      const effectiveDuration = payload.duration_hours ?? currentShift.duration_hours;
      validateDurationHours(effectiveDuration, effectiveStartTime, effectiveEndTime);
    }

    const updateData = {};
    if (payload.name !== undefined) updateData.name = payload.name;
    if (payload.start_time !== undefined) updateData.start_time = payload.start_time;
    if (payload.end_time !== undefined) updateData.end_time = payload.end_time;
    if (payload.duration_hours !== undefined) updateData.duration_hours = payload.duration_hours;
    if (payload.is_active !== undefined) updateData.is_active = payload.is_active;
    updateData.updated_at = nowIso();

    const { data, error: err } = await supabase
      .from("shifts")
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();

    if (err) throw error(400, err.message);
    return data;
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const toggleShiftStatusService = async (id, isActive) => {
  try {
    await getShiftByIdService(id);

    return updateShiftById(id, {
      is_active: isActive,
      updated_at: nowIso(),
    });
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const deleteShiftService = async (id) => {
  try {
    const shift = await getShiftByIdService(id);

    const [attendanceCountResult, assignmentCountResult] = await Promise.all([
      supabase
        .from("attendance_records")
        .select("id", { count: "exact", head: true })
        .eq("shift_id", id),
      supabase
        .from("employee_shift_assignments")
        .select("id", { count: "exact", head: true })
        .eq("shift_id", id),
    ]);

    const { count: attendanceCount, error: attendanceCountErr } = attendanceCountResult;
    const { count: assignmentCount, error: assignmentCountErr } = assignmentCountResult;

    if (attendanceCountErr) throw error(400, attendanceCountErr.message);
    if (assignmentCountErr) throw error(400, assignmentCountErr.message);

    if ((attendanceCount || 0) > 0) {
      if (shift.is_active) {
        const archivedShift = await updateShiftById(id, {
          is_active: false,
          updated_at: nowIso(),
        });

        return {
          success: true,
          action: "archived",
          message:
            "Shift has attendance history and cannot be deleted. It has been deactivated instead.",
          shift: archivedShift,
        };
      }

      return {
        success: true,
        action: "archived",
        message: "Shift has attendance history and remains inactive.",
        shift,
      };
    }

    if ((assignmentCount || 0) > 0) {
      if (shift.is_active) {
        throw error(
          409,
          "Cannot delete shift because it is linked to employee assignments. Deactivate it first, then delete it."
        );
      }

      const { error: deleteAssignmentsErr } = await supabase
        .from("employee_shift_assignments")
        .delete()
        .eq("shift_id", id);

      if (deleteAssignmentsErr) throw error(400, deleteAssignmentsErr.message);
    }

    const { error: err } = await supabase.from("shifts").delete().eq("id", id);

    if (err) throw error(400, err.message);

    return { success: true, action: "deleted", message: "Shift deleted successfully" };
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};
