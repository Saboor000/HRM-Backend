import {
  assignShiftService,
  employeeByAuth,
  getAssignmentsService,
  updateAssignmentService,
} from "../../services/attendance/assignment.service.js";

const toInt = (value) => Number.parseInt(value, 10);
const parsePaging = (query) => ({
  page: toInt(query.page ?? 1),
  limit: toInt(query.limit ?? 10),
});

const send = (res, status, message, data, pagination) =>
  res.status(status).json({
    success: true,
    message,
    ...(data !== undefined ? { data } : {}),
    ...(pagination ? { pagination } : {}),
  });

const getListFilters = (query, keys) =>
  keys.reduce((acc, key) => {
    if (query[key] !== undefined) {
      acc[key] = key === "is_active" ? query[key] === "true" : query[key];
    }
    return acc;
  }, {});

export const assignShift = async (req, res, next) => {
  try {
    const data = await assignShiftService(req.body, req.user.id);
    send(res, 201, "Shift assigned successfully", data);
  } catch (err) {
    next(err);
  }
};

export const getAssignments = async (req, res, next) => {
  try {
    const { page, limit } = parsePaging(req.query);
    const filters = getListFilters(req.query, ["employee_id", "shift_id", "is_active"]);
    const data = await getAssignmentsService(filters, page, limit);
    send(res, 200, "Assignments retrieved successfully", data.data, data.pagination);
  } catch (err) {
    next(err);
  }
};

export const getMyAssignments = async (req, res, next) => {
  try {
    const { page, limit } = parsePaging(req.query);
    const employee = await employeeByAuth(req.user.id);
    const filters = getListFilters(req.query, ["shift_id", "is_active"]);
    const data = await getAssignmentsService({
      ...filters,
      page,
      limit,
      employee_id: employee.id,
    });
    send(res, 200, "My assignments retrieved successfully", data.data, data.pagination);
  } catch (err) {
    next(err);
  }
};

export const updateAssignment = async (req, res, next) => {
  try {
    const data = await updateAssignmentService(req.params.id, req.body, req.user.id);
    send(res, 200, "Assignment updated successfully", data);
  } catch (err) {
    next(err);
  }
};
