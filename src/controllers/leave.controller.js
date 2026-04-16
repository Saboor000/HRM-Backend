import {
  cancelLeaveService,
  createLeaveService,
  getLeaveByIdService,
  getLeavesService,
  hrLeaveActionService,
  managerLeaveActionService,
} from "../services/leave.service.js";

const handleError = (res, err) => {
  const status = err.status || 500;
  return res.status(status).json({ message: err.message || "Internal server error" });
};
const sendLeave = (res, status, message, leave) => res.status(status).json({ message, leave });
const sendList = (res, message, result) => res.status(200).json({ message, ...result });

export const applyLeave = async (req, res) => {
  try {
    const leave = await createLeaveService(req.body, req.user);
    return sendLeave(res, 201, "Leave request submitted successfully", leave);
  } catch (err) {
    return handleError(res, err);
  }
};

export const getLeaves = async (req, res) => {
  try {
    const result = await getLeavesService({ user: req.user, query: req.validatedQuery || req.query });
    return sendList(res, "Leaves fetched successfully", result);
  } catch (err) {
    return handleError(res, err);
  }
};

export const getMyLeaves = async (req, res) => {
  try {
    const result = await getLeavesService({
      user: req.user,
      query: req.validatedQuery || req.query,
      ownOnly: true,
    });

    return sendList(res, "Your leaves fetched successfully", result);
  } catch (err) {
    return handleError(res, err);
  }
};

export const getLeaveById = async (req, res) => {
  try {
    const leave = await getLeaveByIdService({ id: req.params.id, user: req.user });
    return sendLeave(res, 200, "Leave details fetched successfully", leave);
  } catch (err) {
    return handleError(res, err);
  }
};

export const managerLeaveAction = async (req, res) => {
  try {
    const leave = await managerLeaveActionService(
      req.params.id,
      req.body.action,
      req.user,
      req.body.rejection_reason
    );
    return sendLeave(res, 200, "Manager action applied successfully", leave);
  } catch (err) {
    return handleError(res, err);
  }
};

export const hrLeaveAction = async (req, res) => {
  try {
    const leave = await hrLeaveActionService(
      req.params.id,
      req.body.action,
      req.user,
      req.body.rejection_reason
    );
    return sendLeave(res, 200, "HR action applied successfully", leave);
  } catch (err) {
    return handleError(res, err);
  }
};

export const cancelLeave = async (req, res) => {
  try {
    const leave = await cancelLeaveService(req.params.id, req.user, req.body.cancel_reason);
    return sendLeave(res, 200, "Leave cancelled successfully", leave);
  } catch (err) {
    return handleError(res, err);
  }
};
