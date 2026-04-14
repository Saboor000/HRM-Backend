import {
  cancelLeaveService,
  createLeaveService,
  getLeaveByIdService,
  getLeavesService,
  updateLeaveStatusService,
} from "../services/leave.service.js";

const handleError = (res, err) => {
  const status = err.status || 500;
  return res.status(status).json({ message: err.message || "Internal server error" });
};

export const applyLeave = async (req, res) => {
  try {
    const leave = await createLeaveService(req.body, req.user);
    return res.status(201).json({
      message: "Leave request submitted successfully",
      leave,
    });
  } catch (err) {
    return handleError(res, err);
  }
};

export const getLeaves = async (req, res) => {
  try {
    const result = await getLeavesService({ user: req.user, query: req.validatedQuery || req.query });
    return res.status(200).json({
      message: "Leaves fetched successfully",
      ...result,
    });
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

    return res.status(200).json({
      message: "Your leaves fetched successfully",
      ...result,
    });
  } catch (err) {
    return handleError(res, err);
  }
};

export const getLeaveById = async (req, res) => {
  try {
    const leave = await getLeaveByIdService({ id: req.params.id, user: req.user });
    return res.status(200).json({
      message: "Leave details fetched successfully",
      leave,
    });
  } catch (err) {
    return handleError(res, err);
  }
};

export const approveLeave = async (req, res) => {
  try {
    const leave = await updateLeaveStatusService(req.params.id, "approved", req.user);
    return res.status(200).json({
      message: "Leave approved successfully",
      leave,
    });
  } catch (err) {
    return handleError(res, err);
  }
};

export const rejectLeave = async (req, res) => {
  try {
    const leave = await updateLeaveStatusService(
      req.params.id,
      "rejected",
      req.user,
      req.body.rejection_reason
    );
    return res.status(200).json({
      message: "Leave rejected successfully",
      leave,
    });
  } catch (err) {
    return handleError(res, err);
  }
};

export const cancelLeave = async (req, res) => {
  try {
    const leave = await cancelLeaveService(req.params.id, req.user, req.body.cancel_reason);
    return res.status(200).json({
      message: "Leave cancelled successfully",
      leave,
    });
  } catch (err) {
    return handleError(res, err);
  }
};
