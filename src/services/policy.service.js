import { supabase } from "../config/supabase.js";
import { v4 as uuidv4 } from "uuid";

const serviceError = (status, message) => Object.assign(new Error(message), { status });

const parseMaybeJson = (value) => {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const normalizeListField = (value) => {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === "string") {
    return parsed.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return parsed === undefined ? undefined : parsed;
};

const normalizeAttendancePolicyPayload = (policyData = {}) => {
  const normalized = { ...policyData };

  const listFields = [
    "weekly_off_days",
    "working_weekend_dates",
    "holiday_dates",
    "forced_working_dates",
    "manual_off_dates",
  ];

  for (const field of listFields) {
    if (Object.prototype.hasOwnProperty.call(normalized, field)) {
      normalized[field] = normalizeListField(normalized[field]);
    }
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "shift_grace_by_shift_name")) {
    normalized.shift_grace_by_shift_name = parseMaybeJson(normalized.shift_grace_by_shift_name);
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "apply_proration_default")) {
    normalized.apply_proration_default = Boolean(normalized.apply_proration_default);
  } else {
    normalized.apply_proration_default = true;
  }

  return normalized;
};

const normalizeAttendancePolicyRecord = (policy = {}) => {
  if (!policy || typeof policy !== "object") return policy;

  return normalizeAttendancePolicyPayload(policy);
};

const normalizeTaxPolicyPayload = (policyData = {}) => {
  const normalized = { ...policyData };

  if (Object.prototype.hasOwnProperty.call(normalized, "apply_proration_default")) {
    normalized.apply_proration_default = Boolean(normalized.apply_proration_default);
  } else {
    normalized.apply_proration_default = false;
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "tax_slabs")) {
    normalized.tax_slabs = normalizeListField(normalized.tax_slabs);
  }

  if (normalized.tax_mode_default === "slab" && !Array.isArray(normalized.tax_slabs)) {
    throw new Error("tax_slabs is required when tax_mode_default is slab");
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "tax_rate_default")) {
    const parsedRate = Number(normalized.tax_rate_default);
    normalized.tax_rate_default = Number.isFinite(parsedRate) ? parsedRate : null;
  }

  if (normalized.tax_mode_default && normalized.tax_mode_default !== "slab") {
    normalized.tax_slabs = null;
    if (normalized.tax_rate_default === null || normalized.tax_rate_default === undefined || normalized.tax_rate_default < 0) {
      throw new Error("tax_rate_default is required when tax_mode_default is percentage or fixed");
    }
  }

  if (normalized.tax_mode_default === "slab") {
    normalized.tax_rate_default = 0;
  }

  return normalized;
};

const normalizeOvertimePolicyPayload = (policyData = {}) => {
  const normalized = { ...policyData };
  if (Object.prototype.hasOwnProperty.call(normalized, "apply_proration_default")) {
    normalized.apply_proration_default = Boolean(normalized.apply_proration_default);
  } else {
    normalized.apply_proration_default = false;
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "require_full_shift_for_overtime")) {
    normalized.require_full_shift_for_overtime = Boolean(normalized.require_full_shift_for_overtime);
  } else {
    normalized.require_full_shift_for_overtime = true;
  }

  const enforceLimits = Object.prototype.hasOwnProperty.call(normalized, "enforce_limits")
    ? Boolean(normalized.enforce_limits)
    : undefined;

  const mode = String(normalized.limit_enforcement_mode || "").toLowerCase();
  if (mode === "strict" || mode === "manual") {
    normalized.limit_enforcement_mode = mode;
  } else {
    normalized.limit_enforcement_mode = enforceLimits === true ? "strict" : "manual";
  }

  delete normalized.enforce_limits;
  return normalized;
};

const normalizeBonusPolicyPayload = (policyData = {}) => {
  const normalized = { ...policyData };

  if (Object.prototype.hasOwnProperty.call(normalized, "bonus_rate_default")) {
    const parsedRate = Number(normalized.bonus_rate_default);
    normalized.bonus_rate_default = Number.isFinite(parsedRate) ? parsedRate : null;
  }

  if (normalized.bonus_mode_default) {
    if (normalized.bonus_rate_default === null || normalized.bonus_rate_default === undefined || normalized.bonus_rate_default < 0) {
      throw new Error("bonus_rate_default is required when bonus_mode_default is fixed or percentage");
    }
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "apply_proration_default")) {
    normalized.apply_proration_default = Boolean(normalized.apply_proration_default);
  } else {
    normalized.apply_proration_default = true;
  }

  return normalized;
};

const POLICY_TABLES = {
  attendance: "attendance_policies",
  overtime: "overtime_policies",
  tax: "tax_policies",
  bonus: "bonus_policies",
};

const POLICY_LINKED_SALARY_COLUMNS = {
  [POLICY_TABLES.attendance]: "attendance_policy_id",
  [POLICY_TABLES.overtime]: "overtime_policy_id",
  [POLICY_TABLES.tax]: "tax_policy_id",
  [POLICY_TABLES.bonus]: "bonus_policy_id",
};

const ATTENDANCE_TABLE = POLICY_TABLES.attendance;
const normalizePolicyRecord = (tableName, record) =>
  tableName === ATTENDANCE_TABLE ? normalizeAttendancePolicyRecord(record) : record;

const createPolicy = async (tableName, policyData) => {
  const policyWithId = {
    id: policyData.id || uuidv4(),
    ...policyData,
  };
  const { data, error } = await supabase
    .from(tableName)
    .insert([policyWithId])
    .select();
  if (error) throw error;
  return normalizePolicyRecord(tableName, data[0]);
};

const sanitizePolicyUpdatePayload = (policyData = {}) => {
  const sanitized = { ...policyData };

  // Protect immutable/system fields from accidental updates that can break FK references.
  delete sanitized.id;
  delete sanitized.created_at;

  return sanitized;
};

const updatePolicy = async (tableName, id, policyData) => {
  const updateData = sanitizePolicyUpdatePayload(policyData);

  const { data, error } = await supabase
    .from(tableName)
    .update(updateData)
    .eq("id", id)
    .select("*")
    .single();

  if (error?.code === "23503") {
    throw serviceError(409, "Policy update blocked due to dependent salary structures");
  }
  if (error) throw error;
  return normalizePolicyRecord(tableName, data);
};

export const createAttendancePolicy = (policyData) => createPolicy(ATTENDANCE_TABLE, normalizeAttendancePolicyPayload(policyData));
export const updateAttendancePolicy = (id, policyData) => updatePolicy(ATTENDANCE_TABLE, id, normalizeAttendancePolicyPayload(policyData));
export const createOvertimePolicy = (policyData) => createPolicy(POLICY_TABLES.overtime, normalizeOvertimePolicyPayload(policyData));
export const createBonusPolicy = (policyData) => createPolicy(POLICY_TABLES.bonus, normalizeBonusPolicyPayload(policyData));
export const createTaxPolicy = (policyData) => createPolicy(POLICY_TABLES.tax, normalizeTaxPolicyPayload(policyData));

const getPolicyById = async (tableName, id) => {
  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return normalizePolicyRecord(tableName, data);
};

const listPolicies = async (tableName) => {
  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []).map((policy) => normalizePolicyRecord(tableName, policy));
};

const deletePolicy = async (tableName, id) => {
  const linkedColumn = POLICY_LINKED_SALARY_COLUMNS[tableName];
  if (linkedColumn) {
    const { count, error: countError } = await supabase
      .from("salary_structures")
      .select("id", { count: "exact", head: true })
      .eq(linkedColumn, id);

    if (countError) throw countError;

    if ((count || 0) > 0) {
      throw serviceError(
        409,
        `Cannot delete policy because it is linked to ${count} salary structure(s)`
      );
    }
  }

  const { data, error } = await supabase
    .from(tableName)
    .delete()
    .eq("id", id)
    .select("*")
    .single();

  if (error?.code === "23503") {
    throw serviceError(409, "Cannot delete policy because it is linked to salary structures");
  }
  if (error) throw error;
  return data;
};

const getPolicyTable = (type) => POLICY_TABLES[type];

export const listAttendancePolicies = () => listPolicies(getPolicyTable("attendance"));
export const listOvertimePolicies = () => listPolicies(getPolicyTable("overtime"));
export const listTaxPolicies = () => listPolicies(getPolicyTable("tax"));
export const listBonusPolicies = () => listPolicies(getPolicyTable("bonus"));

export const getAttendancePolicyById = (id) => getPolicyById(ATTENDANCE_TABLE, id);
export const getOvertimePolicyById = (id) => getPolicyById(POLICY_TABLES.overtime, id);
export const getTaxPolicyById = (id) => getPolicyById(POLICY_TABLES.tax, id);
export const getBonusPolicyById = (id) => getPolicyById(POLICY_TABLES.bonus, id);

export const updateOvertimePolicy = (id, policyData) => updatePolicy(POLICY_TABLES.overtime, id, normalizeOvertimePolicyPayload(policyData));
export const updateTaxPolicy = (id, policyData) => updatePolicy(POLICY_TABLES.tax, id, normalizeTaxPolicyPayload(policyData));
export const updateBonusPolicy = (id, policyData) => updatePolicy(POLICY_TABLES.bonus, id, normalizeBonusPolicyPayload(policyData));

export const deleteAttendancePolicy = (id) => deletePolicy(ATTENDANCE_TABLE, id);
export const deleteOvertimePolicy = (id) => deletePolicy(POLICY_TABLES.overtime, id);
export const deleteTaxPolicy = (id) => deletePolicy(POLICY_TABLES.tax, id);
export const deleteBonusPolicy = (id) => deletePolicy(POLICY_TABLES.bonus, id);
