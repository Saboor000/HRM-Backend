import {
  createOvertimeRequestService,
  approveOvertimeRequestService,
  rejectOvertimeRequestService,
  cancelOvertimeRequestService,
  getOvertimeRequestsService,
  getOvertimeRequestByIdService,
} from "../../services/attendance/overtime-request.service.js";
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

export const createOvertimeRequest = async (req, res, next) => {
  try {
    const data = await createOvertimeRequestService(req.user.id, req.body);
    send(res, 201, "Overtime request created successfully", data);
  } catch (err) {
    next(err);
  }
};

export const getOvertimeRequests = async (req, res, next) => {
  try {
    const data = await withPaginationFilters(req, ["employee_id", "status"], getOvertimeRequestsService);
    send(res, 200, "Overtime requests retrieved successfully", data.data, data.pagination);
  } catch (err) {
    next(err);
  }
};

export const getMyOvertimeRequests = async (req, res, next) => {
  try {
    const { page, limit } = parsePaging(req.query);
    const employee = await employeeByAuth(req.user.id);
    const filters = getListFilters(req.query, ["status"]);
    const data = await getOvertimeRequestsService(
      { ...filters, employee_id: employee.id },
      page,
      limit
    );
    send(res, 200, "My overtime requests retrieved successfully", data.data, data.pagination);
  } catch (err) {
    next(err);
  }
};

export const getOvertimeRequestById = async (req, res, next) => {
  try {
    const data = await getOvertimeRequestByIdService(req.params.id);
    send(res, 200, "Overtime request retrieved successfully", data);
  } catch (err) {
    next(err);
  }
};

export const approveOvertimeRequest = async (req, res, next) => {
  try {
    const data = await approveOvertimeRequestService(req.params.id, req.user.id);
    send(res, 200, "Overtime request approved successfully", data);
  } catch (err) {
    next(err);
  }
};

export const rejectOvertimeRequest = async (req, res, next) => {
  try {
    const data = await rejectOvertimeRequestService(req.params.id, req.user.id);
    send(res, 200, "Overtime request rejected successfully", data);
  } catch (err) {
    next(err);
  }
};

export const cancelOvertimeRequest = async (req, res, next) => {
  try {
    const data = await cancelOvertimeRequestService(req.params.id, req.user.id);
    send(res, 200, "Overtime request cancelled successfully", data);
  } catch (err) {
    next(err);
  }
};
