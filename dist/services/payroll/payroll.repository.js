import { supabase } from "../../config/supabase.js";
import { error } from "./payroll.utils.js";
const EMPLOYEE_SELECT_FIELDS = "id, first_name, last_name, designation, department";
export const getEmployee = async (employeeId) => {
    const { data, error: err } = await supabase
        .from("employees")
        .select(EMPLOYEE_SELECT_FIELDS)
        .eq("id", employeeId)
        .maybeSingle();
    if (err)
        throw error(400, err.message);
    if (!data)
        throw error(404, "Employee not found");
    return data;
};
export const getEmployeesByIds = async (employeeIds = []) => {
    const ids = [...new Set(employeeIds.filter(Boolean))];
    if (!ids.length)
        return new Map();
    const { data, error: err } = await supabase
        .from("employees")
        .select(EMPLOYEE_SELECT_FIELDS)
        .in("id", ids);
    if (err)
        throw error(400, err.message);
    return new Map((data || []).map((employee) => [employee.id, employee]));
};
export const getSalaryStructure = async (employeeId) => {
    const { data, error: err } = await supabase
        .from("salary_structures")
        .select("*")
        .eq("employee_id", employeeId)
        .eq("is_active", true)
        .maybeSingle();
    if (err)
        throw error(400, err.message);
    if (!data)
        throw error(404, "Salary structure not found for employee");
    return data;
};
export const findSalaryStructureByEmployee = async (employeeId) => {
    const { data, error: qErr } = await supabase
        .from("salary_structures")
        .select("*")
        .eq("employee_id", employeeId)
        .maybeSingle();
    if (qErr)
        throw error(400, qErr.message);
    if (!data)
        throw error(404, "Salary structure not found for employee");
    return data;
};
export const findSalaryStructureById = async (id) => {
    const { data, error: qErr } = await supabase
        .from("salary_structures")
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (qErr)
        throw error(400, qErr.message);
    if (!data)
        throw error(404, "Salary structure not found");
    return data;
};
export const insertSalaryStructure = async (structure) => {
    const { data, error: insertErr } = await supabase
        .from("salary_structures")
        .insert(structure)
        .select("*")
        .single();
    if (insertErr)
        throw error(400, insertErr.message);
    return data;
};
export const updateSalaryStructureById = async (id, structure) => {
    const { data, error: updateErr } = await supabase
        .from("salary_structures")
        .update(structure)
        .eq("id", id)
        .select("*")
        .single();
    if (updateErr)
        throw error(400, updateErr.message);
    return data;
};
export const listSalaryStructures = async ({ page = 1, limit = 10, employee_id }) => {
    const from = (page - 1) * limit;
    let q = supabase
        .from("salary_structures")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });
    if (employee_id)
        q = q.eq("employee_id", employee_id);
    const { data, error: qErr, count } = await q.range(from, from + limit - 1);
    if (qErr)
        throw error(400, qErr.message);
    return { data: data || [], count: count || 0, page, limit };
};
export const findExistingPayroll = async (employeeId, month, year) => {
    const { data, error: err } = await supabase
        .from("payrolls")
        .select("*")
        .eq("employee_id", employeeId)
        .eq("month", month)
        .eq("year", year)
        .maybeSingle();
    if (err)
        throw error(400, err.message);
    return data || null;
};
export const fetchPayrollById = async (id) => {
    const { data, error: err } = await supabase
        .from("payrolls")
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (err)
        throw error(400, err.message);
    if (!data)
        throw error(404, "Payroll not found");
    return data;
};
export const persistPayrollRow = async (row) => {
    const { data, error: err } = await supabase
        .from("payrolls")
        .insert(row)
        .select("*")
        .single();
    if (err)
        throw error(400, err.message);
    return data;
};
export const deletePayrollById = async (id) => {
    const { data, error: err } = await supabase
        .from("payrolls")
        .delete()
        .eq("id", id)
        .select("*")
        .single();
    if (err)
        throw error(400, err.message);
    return data;
};
export const deletePayslipByPayrollId = async (payrollId) => {
    const { data, error: err } = await supabase
        .from("payslips")
        .delete()
        .eq("payroll_id", payrollId)
        .select("*")
        .maybeSingle();
    if (err)
        throw error(400, err.message);
    return data || null;
};
export const upsertPayslip = async (payroll, snapshot) => {
    const { data, error: err } = await supabase
        .from("payslips")
        .upsert({
        payroll_id: payroll.id,
        employee_id: payroll.employee_id,
        month: payroll.month,
        year: payroll.year,
        snapshot,
        updated_at: new Date().toISOString(),
    }, { onConflict: "payroll_id" })
        .select("*")
        .single();
    if (err)
        throw error(400, err.message);
    return data;
};
export const updatePayrollStatus = async (id, updates) => {
    const { data, error: updateErr } = await supabase
        .from("payrolls")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();
    if (updateErr)
        throw error(400, updateErr.message);
    return data;
};
export const listActiveSalaryStructureEmployeeIds = async () => {
    const { data: structures, error: structureErr } = await supabase
        .from("salary_structures")
        .select("employee_id")
        .eq("is_active", true);
    if (structureErr)
        throw error(400, structureErr.message);
    return [...new Set((structures || []).map((row) => row.employee_id).filter(Boolean))];
};
export const listPayrollByEmployee = async (employeeId, query = {}) => {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 10);
    const from = (page - 1) * limit;
    let payrollQuery = supabase
        .from("payrolls")
        .select("*", { count: "exact" })
        .eq("employee_id", employeeId)
        .order("year", { ascending: false })
        .order("month", { ascending: false });
    if (query.status)
        payrollQuery = payrollQuery.eq("status", query.status);
    if (query.month)
        payrollQuery = payrollQuery.eq("month", Number(query.month));
    if (query.year)
        payrollQuery = payrollQuery.eq("year", Number(query.year));
    if (query.month && query.year) {
        const { data, error: err } = await payrollQuery.maybeSingle();
        if (err)
            throw error(400, err.message);
        if (!data)
            throw error(404, "Payroll not found for the selected period");
        return { payroll: data, page, limit, count: 1 };
    }
    const { data, error: err, count } = await payrollQuery.range(from, from + limit - 1);
    if (err)
        throw error(400, err.message);
    return { payrolls: data || [], page, limit, count: count || 0 };
};
export const findPayslipByPayrollId = async (payrollId) => {
    const { data, error: err } = await supabase
        .from("payslips")
        .select("*")
        .eq("payroll_id", payrollId)
        .maybeSingle();
    if (err)
        throw error(400, err.message);
    return data || null;
};
//# sourceMappingURL=payroll.repository.js.map