import {
  createShiftChangeRequestService,
  approveShiftChangeRequestService,
  rejectShiftChangeRequestService,
  getShiftChangeRequestsService,
  getShiftChangeRequestByIdService,
} from "../../services/attendance/shift-request.service.js";

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
    const { page = 1, limit = 10 } = req.query;
    const filters = getListFilters(req.query, ["employee_id", "status"]);
    const data = await getShiftChangeRequestsService(filters, toInt(page), toInt(limit));
    send(res, 200, "Shift change requests retrieved successfully", data.data, data.pagination);
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
