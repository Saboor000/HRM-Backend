import {
  checkInService,
  checkOutService,
  getCurrentStatusService,
} from "../../services/attendance/checkin-checkout.service.js";

const send = (res, status, message, data, pagination) =>
  res.status(status).json({
    success: true,
    message,
    ...(data !== undefined ? { data } : {}),
    ...(pagination ? { pagination } : {}),
  });

export const checkIn = async (req, res, next) => {
  try {
    const data = await checkInService(req.user.id, req.body);
    send(res, 201, "Checked in successfully", data);
  } catch (err) {
    next(err);
  }
};

export const checkOut = async (req, res, next) => {
  try {
    const data = await checkOutService(req.user.id, req.body);
    send(res, 200, "Checked out successfully", data);
  } catch (err) {
    next(err);
  }
};

export const getCurrentStatus = async (req, res, next) => {
  try {
    const data = await getCurrentStatusService(req.user.id);
    send(res, 200, "Current status retrieved successfully", data);
  } catch (err) {
    next(err);
  }
};
