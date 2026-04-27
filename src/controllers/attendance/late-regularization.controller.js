import {
  listLateRegularizationsService,
  reviewLateRegularizationService,
  submitLateRegularizationService,
} from "../../services/attendance/late-regularization.service.js";

const send = (res, status, message, data, pagination) =>
  res.status(status).json({
    success: true,
    message,
    ...(data !== undefined ? { data } : {}),
    ...(pagination ? { pagination } : {}),
  });

export const submitLateRegularization = async (req, res, next) => {
  try {
    const data = await submitLateRegularizationService(req.user.id, req.body, req.files || []);
    send(res, 201, "Late regularization request submitted successfully", data);
  } catch (err) {
    next(err);
  }
};

export const listLateRegularizations = async (req, res, next) => {
  try {
    const result = await listLateRegularizationsService(req.user.id, req.validatedQuery || req.query);
    send(res, 200, "Late regularizations retrieved successfully", result.data, result.pagination);
  } catch (err) {
    next(err);
  }
};

export const reviewLateRegularization = async (req, res, next) => {
  try {
    const data = await reviewLateRegularizationService(
      req.user.id,
      req.params.id,
      req.body
    );
    send(res, 200, "Late regularization reviewed successfully", data);
  } catch (err) {
    next(err);
  }
};
