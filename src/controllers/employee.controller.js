import {
  createEmployeeService,
  deleteEmployeeService,
  getAllEmployeesService,
  getEmployeeByIdService,
  updateEmployeeService,
} from "../services/employee.service.js";

export const createEmployee = async (req, res) => {
  try {
    const result = await createEmployeeService({ body: req.body, user: req.user, files: req.files });

    if (result?.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    return res.status(201).json({
      message: "Employee created successfully",
      employee: result.employee,
      user: result.user,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const getAllEmployees = async (req, res) => {
  try {
    const result = await getAllEmployeesService(req.validatedQuery || req.query);

    if (result?.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const getEmployeeById = async (req, res) => {
  try {
    const result = await getEmployeeByIdService({ id: req.params.id, user: req.user });

    if (result?.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    return res.status(200).json({ employee: result.employee });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const updateEmployee = async (req, res) => {
  try {
    const result = await updateEmployeeService({ id: req.params.id, body: req.body });

    if (result?.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    return res.status(200).json({ message: "Updated successfully", employee: result.employee });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const deleteEmployee = async (req, res) => {
  try {
    const result = await deleteEmployeeService({ id: req.params.id });

    if (result?.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    return res.status(200).json({ message: result.message });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};