import { createEmployeeService, deleteEmployeeService, getAllEmployeesService, getEmployeeByIdService, updateEmployeeService, } from "../services/employee.service.js";
const handleServiceResult = (res, result, successStatus = 200, successBody = result) => {
    if (result?.error) {
        return res.status(result.error.status).json({ message: result.error.message });
    }
    return res.status(successStatus).json(successBody);
};
const handleServerError = (res, err) => res.status(500).json({ message: err.message });
const sendServiceError = (res, result) => res.status(result.error.status).json({ message: result.error.message });
export const createEmployee = async (req, res) => {
    try {
        const result = await createEmployeeService({ body: req.body, user: req.user, files: req.files });
        return handleServiceResult(res, result, 201, {
            message: "Employee created successfully",
            employee: result.employee,
            user: result.user,
        });
    }
    catch (err) {
        return handleServerError(res, err);
    }
};
export const getAllEmployees = async (req, res) => {
    try {
        const result = await getAllEmployeesService(req.validatedQuery || req.query);
        return handleServiceResult(res, result);
    }
    catch (err) {
        return handleServerError(res, err);
    }
};
export const getEmployeeById = async (req, res) => {
    try {
        const result = await getEmployeeByIdService({ id: req.params.id, user: req.user });
        return handleServiceResult(res, result, 200, { employee: result.employee });
    }
    catch (err) {
        return handleServerError(res, err);
    }
};
export const updateEmployee = async (req, res) => {
    try {
        const result = await updateEmployeeService({
            id: req.params.id,
            body: req.body,
            files: req.files,
        });
        if (result?.error)
            return sendServiceError(res, result);
        // If password was provided, update it in Supabase Auth too
        if (req.body.password && result.employee?.auth_id) {
            await supabase.auth.admin.updateUserById(result.employee.auth_id, {
                password: req.body.password,
            });
        }
        return res.status(200).json({
            message: "Updated successfully",
            employee: result.employee,
        });
    }
    catch (err) {
        return handleServerError(res, err);
    }
};
export const deleteEmployee = async (req, res) => {
    try {
        const result = await deleteEmployeeService({ id: req.params.id });
        return handleServiceResult(res, result, 200, { message: result.message });
    }
    catch (err) {
        return handleServerError(res, err);
    }
};
//# sourceMappingURL=employee.controller.js.map