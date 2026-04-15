import {
  createOvertimeRequestService,
  approveOvertimeRequestService,
  rejectOvertimeRequestService,
  getOvertimeRequestsService,
  getOvertimeRequestByIdService,
} from "../../services/attendance/overtime-request.service.js";

const toInt = (value) => Number.parseInt(value, 10);
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
    const { page = 1, limit = 10 } = req.query;
    const filters = getListFilters(req.query, ["employee_id", "status"]);
    const data = await getOvertimeRequestsService(filters, toInt(page), toInt(limit));
    send(res, 200, "Overtime requests retrieved successfully", data.data, data.pagination);
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
