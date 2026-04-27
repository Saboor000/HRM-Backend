import { supabase } from "../../config/supabase.js";
import { uploadFile } from "../../utils/uploadToSupabase.js";

const error = (status, message) => Object.assign(new Error(message), { status });

export const LATE_REGULARIZATION_TYPES = [
  "late_arrival",
  "missed_checkin",
  "early_checkout",
  "short_hours",
  "shift_mismatch",
  "system_error",
  "transport_issue",
  "weather_issue",
  "medical_reason",
  "official_work",
  "emergency",
  "other",
];

export const LATE_REGULARIZATION_STATUSES = ["pending", "approved", "rejected"];

const REGULARIZATION_SELECT = `
  *,
  employee:employee_id(id, first_name, last_name, designation, department),
  attendance:attendance_id(id, employee_id, date, status, check_in_time, check_out_time, duration_hours),
  reviewer:reviewed_by(id, first_name, last_name, designation)
`;

const toDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().split("T")[0];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().split("T")[0];
};

const getMonthRange = (dateValue) => {
  const date = new Date(dateValue);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));

  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
};

const isReviewerDesignation = (designation) => {
  const value = String(designation || "").toLowerCase();
  return value === "admin" || value === "hr";
};

const parseDocList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => String(item));
  return [String(value)];
};

const getEmployeeByAuthId = async (authId) => {
  const { data, error: err } = await supabase
    .from("employees")
    .select("id, auth_id, first_name, last_name, designation, department")
    .eq("auth_id", authId)
    .maybeSingle();

  if (err) throw error(400, err.message);
  if (!data) throw error(404, "Employee not found");
  return data;
};

const getAttendanceRecordById = async (attendanceId) => {
  const { data, error: err } = await supabase
    .from("attendance_records")
    .select("id, employee_id, date, status, check_in_time, check_out_time, duration_hours, shift_id")
    .eq("id", attendanceId)
    .maybeSingle();

  if (err) throw error(400, err.message);
  if (!data) throw error(404, "Attendance record not found");
  return data;
};

const getLateRegularizationPolicy = async (employeeId) => {
  const { data: salaryStructure, error: salaryErr } = await supabase
    .from("salary_structures")
    .select("attendance_policy_id")
    .eq("employee_id", employeeId)
    .eq("is_active", true)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (salaryErr) throw error(400, salaryErr.message);

  if (!salaryStructure?.attendance_policy_id) {
    throw error(422, "Active salary structure with attendance policy is required for late regularization");
  }

  const { data: policy, error: policyErr } = await supabase
    .from("attendance_policies")
    .select("id, late_regularization_window_hours, late_regularization_monthly_limit, late_regularization_require_documents")
    .eq("id", salaryStructure.attendance_policy_id)
    .maybeSingle();

  if (policyErr) {
    if (String(policyErr.message || "").toLowerCase().includes("does not exist")) {
      throw error(
        500,
        "Attendance policy regularization columns are missing. Run DB migration to add late_regularization_* fields."
      );
    }
    throw error(400, policyErr.message);
  }

  if (!policy) {
    throw error(404, "Attendance policy not found for active salary structure");
  }

  return {
    submission_window_hours: Number(policy.late_regularization_window_hours),
    monthly_limit: Number(policy.late_regularization_monthly_limit),
    require_documents: Boolean(policy.late_regularization_require_documents),
  };
};

const validateSubmissionWindow = ({ attendanceDate, windowHours, overrideAllowed }) => {
  if (overrideAllowed) return;
  const attendanceEnd = new Date(`${attendanceDate}T23:59:59.000Z`);
  const elapsedHours = (Date.now() - attendanceEnd.getTime()) / (1000 * 60 * 60);

  if (elapsedHours > windowHours) {
    throw error(422, `Regularization window exceeded. Submit within ${windowHours} hours of incident date.`);
  }
};

const validateMonthlyLimit = async ({ employeeId, attendanceDate, limit, overrideAllowed }) => {
  if (overrideAllowed || !Number.isFinite(limit) || limit <= 0) return;

  const monthRange = getMonthRange(attendanceDate);
  const { count, error: err } = await supabase
    .from("late_regularizations")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", employeeId)
    .gte("incident_date", monthRange.start)
    .lte("incident_date", monthRange.end)
    .in("status", ["pending", "approved"]);

  if (err) throw error(400, err.message);

  if ((count || 0) >= limit) {
    throw error(422, `Monthly regularization limit reached (${limit}). Contact HR for override.`);
  }
};

const ensureTypeAllowed = (type) => {
  if (!LATE_REGULARIZATION_TYPES.includes(type)) {
    throw error(422, "Invalid regularization type");
  }
};

const uploadSupportingDocuments = async (files = []) => {
  if (!Array.isArray(files) || files.length === 0) return [];

  const uploaded = [];
  for (const file of files) {
    const url = await uploadFile(file, "other");
    uploaded.push(url);
  }

  return uploaded;
};

export const getApprovedRegularizationsForAttendanceIds = async (attendanceIds = []) => {
  const uniqueIds = Array.from(new Set((attendanceIds || []).filter(Boolean)));
  const map = new Map();

  if (!uniqueIds.length) return map;

  const { data, error: err } = await supabase
    .from("late_regularizations")
    .select("id, attendance_id, type, custom_type, reason, status, applied_effect, created_at, reviewed_at")
    .eq("status", "approved")
    .eq("applied_effect", true)
    .in("attendance_id", uniqueIds)
    .order("created_at", { ascending: true });

  if (err) throw error(400, err.message);

  for (const row of data || []) {
    const key = row.attendance_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }

  return map;
};

const hasType = (regularizations, values) =>
  (regularizations || []).some((entry) => values.has(String(entry?.type || "").toLowerCase()));

export const applyRegularizationToEvaluation = (evaluation = {}, regularizations = []) => {
  if (!regularizations.length) return evaluation;

  const lateWaiverTypes = new Set([
    "late_arrival",
    "weather_issue",
    "transport_issue",
    "system_error",
    "medical_reason",
    "emergency",
  ]);
  const attendanceWaiverTypes = new Set([
    "missed_checkin",
    "early_checkout",
    "short_hours",
    "shift_mismatch",
    "official_work",
    "weather_issue",
    "transport_issue",
    "system_error",
    "medical_reason",
    "emergency",
    "other",
  ]);

  const lateWaived = hasType(regularizations, lateWaiverTypes);
  const attendanceWaived = hasType(regularizations, attendanceWaiverTypes);

  const next = { ...evaluation };

  if (lateWaived) {
    next.is_late = false;
    next.late_minutes = 0;
  }

  if (
    attendanceWaived &&
    next.is_working_day &&
    (next.evaluated_status === "absent" || next.evaluated_status === "half_day")
  ) {
    next.evaluated_status = "present";
    next.payable_day_fraction = 1;
  }

  const regularizationMeta = {
    applied: true,
    approved_count: regularizations.length,
    ids: regularizations.map((item) => item.id),
    types: regularizations.map((item) => item.type),
    late_waived: lateWaived,
    attendance_waived: attendanceWaived,
  };

  next.notes = Array.isArray(next.notes)
    ? [...next.notes, "regularization_applied"]
    : ["regularization_applied"];
  next.regularization = regularizationMeta;

  return next;
};

export const resolveEffectiveAttendanceStatus = (attendanceRecord = {}, regularizations = []) => {
  const status = String(attendanceRecord?.status || "");
  if (!regularizations.length) {
    return {
      status,
      applied: false,
      ids: [],
      types: [],
    };
  }

  const normalizeUpper = status.toUpperCase();
  const isAbsentLike = normalizeUpper === "ABSENT" || status === "absent";
  const isHalfDayLike = normalizeUpper === "HALF_DAY" || status === "half_day";

  const attendanceWaiverTypes = new Set([
    "missed_checkin",
    "early_checkout",
    "short_hours",
    "shift_mismatch",
    "official_work",
    "weather_issue",
    "transport_issue",
    "system_error",
    "medical_reason",
    "emergency",
    "other",
  ]);

  const shouldWaiveAttendance = hasType(regularizations, attendanceWaiverTypes);
  let effectiveStatus = status;

  if (shouldWaiveAttendance && (isAbsentLike || isHalfDayLike)) {
    effectiveStatus = "PRESENT";
  }

  return {
    status: effectiveStatus,
    applied: true,
    ids: regularizations.map((item) => item.id),
    types: regularizations.map((item) => item.type),
  };
};

export const submitLateRegularizationService = async (authId, payload = {}, files = []) => {
  const actor = await getEmployeeByAuthId(authId);

  const type = String(payload.type || "").trim().toLowerCase();
  ensureTypeAllowed(type);

  const attendance = await getAttendanceRecordById(payload.attendance_id);

  if (attendance.employee_id !== actor.id) {
    throw error(403, "You can only regularize your own attendance record");
  }

  const policy = await getLateRegularizationPolicy(attendance.employee_id);
  const customType = payload.custom_type ? String(payload.custom_type).trim() : null;

  validateSubmissionWindow({
    attendanceDate: attendance.date,
    windowHours: Math.max(1, Number(policy.submission_window_hours || 48)),
    overrideAllowed: false,
  });

  await validateMonthlyLimit({
    employeeId: attendance.employee_id,
    attendanceDate: attendance.date,
    limit: Number(policy.monthly_limit || 0),
    overrideAllowed: false,
  });

  const uploadedDocs = await uploadSupportingDocuments(files);
  const docList = [...parseDocList(payload.supporting_documents), ...uploadedDocs];

  if (policy.require_documents && !docList.length) {
    throw error(422, "Supporting documents are required for regularization under current policy");
  }

  const { data: duplicate, error: duplicateErr } = await supabase
    .from("late_regularizations")
    .select("id")
    .eq("attendance_id", attendance.id)
    .eq("type", type)
    .in("status", ["pending", "approved"])
    .limit(1)
    .maybeSingle();

  if (duplicateErr) throw error(400, duplicateErr.message);
  if (duplicate) {
    throw error(409, "A pending/approved regularization already exists for this attendance record and type");
  }

  const now = new Date().toISOString();

  const { data, error: insertErr } = await supabase
    .from("late_regularizations")
    .insert({
      employee_id: attendance.employee_id,
      attendance_id: attendance.id,
      incident_date: toDateOnly(attendance.date),
      type,
      custom_type: type === "other" ? customType : null,
      reason: String(payload.reason || "").trim(),
      supporting_documents: docList,
      status: "pending",
      submitted_by: actor.id,
      reviewed_by: null,
      review_remarks: null,
      override_used: false,
      override_reason: null,
      applied_effect: false,
      reviewed_at: null,
      created_at: now,
      updated_at: now,
    })
    .select(REGULARIZATION_SELECT)
    .single();

  if (insertErr) throw error(400, insertErr.message);

  return {
    ...data,
    policy_snapshot: policy,
  };
};

export const listLateRegularizationsService = async (authId, query = {}) => {
  const actor = await getEmployeeByAuthId(authId);
  const isReviewer = isReviewerDesignation(actor.designation);

  const page = Number.parseInt(query.page, 10) || 1;
  const limit = Number.parseInt(query.limit, 10) || 10;
  const from = (page - 1) * limit;

  let q = supabase
    .from("late_regularizations")
    .select(REGULARIZATION_SELECT, { count: "exact" })
    .order("created_at", { ascending: false });

  if (!isReviewer) {
    q = q.eq("employee_id", actor.id);
  }

  if (isReviewer && query.employee_id) {
    q = q.eq("employee_id", query.employee_id);
  }

  if (query.attendance_id) q = q.eq("attendance_id", query.attendance_id);
  if (query.status) q = q.eq("status", query.status);
  if (query.type) q = q.eq("type", String(query.type).toLowerCase());
  if (query.custom_type) q = q.ilike("custom_type", String(query.custom_type).trim());
  if (query.start_date) q = q.gte("incident_date", toDateOnly(query.start_date));
  if (query.end_date) q = q.lte("incident_date", toDateOnly(query.end_date));

  const { data, error: err, count } = await q.range(from, from + limit - 1);
  if (err) throw error(400, err.message);

  return {
    data: data || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      pages: Math.ceil((count || 0) / limit),
    },
  };
};

export const reviewLateRegularizationService = async (authId, regularizationId, payload = {}) => {
  const actor = await getEmployeeByAuthId(authId);
  if (!isReviewerDesignation(actor.designation)) {
    throw error(403, "Only HR/Admin can review regularizations");
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("late_regularizations")
    .select(REGULARIZATION_SELECT)
    .eq("id", regularizationId)
    .maybeSingle();

  if (fetchErr) throw error(400, fetchErr.message);
  if (!existing) throw error(404, "Late regularization request not found");

  const nextStatus = String(payload.status || "").toLowerCase();
  if (!LATE_REGULARIZATION_STATUSES.includes(nextStatus) || nextStatus === "pending") {
    throw error(422, "Review status must be approved or rejected");
  }

  const now = new Date().toISOString();
  const applyEffect = nextStatus === "approved" ? (payload.applied_effect !== false) : false;
  const hrOverride = nextStatus === "approved" ? Boolean(payload.hr_override) : false;

  const { data, error: updateErr } = await supabase
    .from("late_regularizations")
    .update({
      status: nextStatus,
      reviewed_by: actor.id,
      review_remarks: payload.remarks ? String(payload.remarks).trim() : null,
      reviewed_at: now,
      override_used: hrOverride,
      override_reason: hrOverride ? String(payload.override_reason || "").trim() || null : null,
      applied_effect: applyEffect,
      updated_at: now,
    })
    .eq("id", regularizationId)
    .select(REGULARIZATION_SELECT)
    .single();

  if (updateErr) throw error(400, updateErr.message);

  return data;
};
