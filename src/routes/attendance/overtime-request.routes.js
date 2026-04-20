import { Router } from "express";
import { authorize } from "../../middleware/auth.middleware.js";
import { validateBody, validateParams, validateQuery } from "../../middleware/validateRequest.middleware.js";
import {
  createOvertimeRequest,
  getOvertimeRequests,
  getMyOvertimeRequests,
  getOvertimeRequestById,
  approveOvertimeRequest,
  rejectOvertimeRequest,
} from "../../controllers/attendance/overtime-request.controller.js";
import {
  createOvertimeRequestSchema,
  overtimeRequestIdParamSchema,
  overtimeRequestQuerySchema,
} from "../../validators/attendance.validator.js";

const router = Router();
const adminHr = authorize("admin", "hr");
const adminHrManager = authorize("admin", "hr", "manager");
const validateOvertimeRequestId = validateParams(overtimeRequestIdParamSchema);
router.post("/attendance/overtime-requests", validateBody(createOvertimeRequestSchema), createOvertimeRequest);
router.get("/attendance/overtime-requests", adminHrManager, validateQuery(overtimeRequestQuerySchema), getOvertimeRequests);
router.get("/attendance/overtime-requests/me", getMyOvertimeRequests);
router.get(
  "/attendance/overtime-requests/:id",
  adminHrManager,
  validateOvertimeRequestId,
  getOvertimeRequestById
);
router.put(
  "/attendance/overtime-requests/:id/approve",
  adminHr,
  validateOvertimeRequestId,
  approveOvertimeRequest
);
router.put(
  "/attendance/overtime-requests/:id/reject",
  adminHr,
  validateOvertimeRequestId,
  rejectOvertimeRequest
);

export default router;
