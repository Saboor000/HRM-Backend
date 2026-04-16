import { Router } from "express";
import { authorize } from "../../middleware/auth.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middleware/validateRequest.middleware.js";
import {
  createShiftChangeRequest,
  getShiftChangeRequests,
  getMyShiftChangeRequests,
  getShiftChangeRequestById,
  approveShiftChangeRequest,
  rejectShiftChangeRequest,
} from "../../controllers/attendance/shift-request.controller.js";
import {
  createShiftChangeRequestSchema,
  shiftChangeRequestIdParamSchema,
  shiftChangeRequestQuerySchema,
} from "../../validators/attendance.validator.js";

const router = Router();
const adminHr = authorize("admin", "hr");
const adminHrManager = authorize("admin", "hr", "manager");

router.post(
  "/attendance/shift-requests",
  validateBody(createShiftChangeRequestSchema),
  createShiftChangeRequest,
);
router.get(
  "/attendance/shift-requests",
  adminHrManager,
  validateQuery(shiftChangeRequestQuerySchema),
  getShiftChangeRequests,
);
router.get("/attendance/shift-requests/me", getMyShiftChangeRequests);
router.get(
  "/attendance/shift-requests/:id",
  adminHrManager,
  validateParams(shiftChangeRequestIdParamSchema),
  getShiftChangeRequestById,
);
router.put(
  "/attendance/shift-requests/:id/approve",
  adminHr,
  validateParams(shiftChangeRequestIdParamSchema),
  approveShiftChangeRequest,
);
router.put(
  "/attendance/shift-requests/:id/reject",
  adminHr,
  validateParams(shiftChangeRequestIdParamSchema),
  rejectShiftChangeRequest,
);

export default router;
