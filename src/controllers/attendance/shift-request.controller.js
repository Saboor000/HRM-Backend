import {
  createShiftChangeRequestService,
  approveShiftChangeRequestService,
  rejectShiftChangeRequestService,
  cancelShiftChangeRequestService,
  getShiftChangeRequestsService,
  getShiftChangeRequestByIdService,
} from "../../services/attendance/shift-request.service.js";
import { employeeByAuth } from "../../services/attendance/assignment.service.js";

const toInt = (value) => Number.parseInt(value, 10);
const parsePaging = (query) => ({ page: toInt(query.page ?? 1), limit: toInt(query.limit ?? 10) });
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
      acc[key] = query[key];
    }
    return acc;
  }, {});

const withPaginationFilters = async (req, keys, service) => {
  const { page, limit } = parsePaging(req.query);
  const filters = getListFilters(req.query, keys);
  return service(filters, page, limit);
};

export const createShiftChangeRequest = async (req, res, next) => {
  try {
    const data = await createShiftChangeRequestService(req.user.id, req.body);
    send(res, 201, "Shift change request created successfully", data);
  } catch (err) {
    next(err);
  }
};

export const getShiftChangeRequests = async (req, res, next) => {
  try {
    const data = await withPaginationFilters(req, ["employee_id", "status"], getShiftChangeRequestsService);
    send(res, 200, "Shift change requests retrieved successfully", data.data, data.pagination);
  } catch (err) {
    next(err);
  }
};

export const getMyShiftChangeRequests = async (req, res, next) => {
  try {
    const { page, limit } = parsePaging(req.query);
    const employee = await employeeByAuth(req.user.id);
    const filters = getListFilters(req.query, ["status"]);
    const data = await getShiftChangeRequestsService(
      { ...filters, employee_id: employee.id },
      page,
      limit
    );
    send(res, 200, "My shift change requests retrieved successfully", data.data, data.pagination);
  } catch (err) {
    next(err);
  }
};

export const getShiftChangeRequestById = async (req, res, next) => {
  try {
    const data = await getShiftChangeRequestByIdService(req.params.id);
    send(res, 200, "Shift change request retrieved successfully", data);
  } catch (err) {
    next(err);
  }
};

export const approveShiftChangeRequest = async (req, res, next) => {
  try {
    const data = await approveShiftChangeRequestService(req.params.id, req.user.id);
    send(res, 200, "Shift change request approved successfully", data);
  } catch (err) {
    next(err);
  }
};

export const rejectShiftChangeRequest = async (req, res, next) => {
  try {
    const data = await rejectShiftChangeRequestService(req.params.id, req.user.id);
    send(res, 200, "Shift change request rejected successfully", data);
  } catch (err) {
    next(err);
  }
};

export const cancelShiftChangeRequest = async (req, res, next) => {
  try {
    const data = await cancelShiftChangeRequestService(req.params.id, req.user.id);
    send(res, 200, "Shift change request cancelled successfully", data);
  } catch (err) {
    next(err);
  }
};
