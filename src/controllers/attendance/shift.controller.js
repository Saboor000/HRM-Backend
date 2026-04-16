import {
  createShiftService,
  getShiftsService,
  getShiftByIdService,
  updateShiftService,
  toggleShiftStatusService,
  deleteShiftService,
} from "../../services/attendance/shift.service.js";
import { employeeByAuth, getAssignmentsService } from "../../services/attendance/assignment.service.js";

const toInt = (value) => Number.parseInt(value, 10);
const send = (res, status, message, data, pagination) =>
  res.status(status).json({
    success: true,
    message,
    ...(data !== undefined ? { data } : {}),
    ...(pagination ? { pagination } : {}),
  });

export const createShift = async (req, res, next) => {
  try {
    const data = await createShiftService(req.body, req.user.id);
    send(res, 201, "Shift created successfully", data);
  } catch (err) {
    next(err);
  }
};

export const getShifts = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const data = await getShiftsService(toInt(page), toInt(limit));
    send(res, 200, "Shifts retrieved successfully", data, data.pagination);
  } catch (err) {
    next(err);
  }
};

export const getMyShifts = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, is_active } = req.query;
    const employee = await employeeByAuth(req.user.id);
    const data = await getAssignmentsService({
      page: toInt(page),
      limit: toInt(limit),
      employee_id: employee.id,
      ...(is_active !== undefined ? { is_active: is_active === "true" } : {}),
    });
    send(res, 200, "My shifts retrieved successfully", data.data, data.pagination);
  } catch (err) {
    next(err);
  }
};

export const getShiftById = async (req, res, next) => {
  try {
    const data = await getShiftByIdService(req.params.id);
    send(res, 200, "Shift retrieved successfully", data);
  } catch (err) {
    next(err);
  }
};

export const updateShift = async (req, res, next) => {
  try {
    const data = await updateShiftService(req.params.id, req.body, req.user.id);
    send(res, 200, "Shift updated successfully", data);
  } catch (err) {
    next(err);
  }
};

export const toggleShiftStatus = async (req, res, next) => {
  try {
    const data = await toggleShiftStatusService(req.params.id, req.body.is_active);
    send(
      res,
      200,
      req.body.is_active ? "Shift activated successfully" : "Shift deactivated successfully",
      data
    );
  } catch (err) {
    next(err);
  }
};

export const deleteShift = async (req, res, next) => {
  try {
    const result = await deleteShiftService(req.params.id);
    send(res, 200, result.message, result);
  } catch (err) {
    next(err);
  }
};
