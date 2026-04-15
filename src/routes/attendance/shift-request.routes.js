import { Router } from "express";
import { authorize } from "../../middleware/auth.middleware.js";
import { validateBody, validateParams, validateQuery } from "../../middleware/validateRequest.middleware.js";
import {
  createShiftChangeRequest,
  getShiftChangeRequests,
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

router.post("/attendance/shift-requests", validateBody(createShiftChangeRequestSchema), createShiftChangeRequest);
router.get("/attendance/shift-requests", validateQuery(shiftChangeRequestQuerySchema), getShiftChangeRequests);
router.get(
  "/attendance/shift-requests/:id",
  validateParams(shiftChangeRequestIdParamSchema),
  getShiftChangeRequestById
);
router.put(
  "/attendance/shift-requests/:id/approve",
  adminHr,
  validateParams(shiftChangeRequestIdParamSchema),
  approveShiftChangeRequest
);
router.put(
  "/attendance/shift-requests/:id/reject",
  adminHr,
  validateParams(shiftChangeRequestIdParamSchema),
  rejectShiftChangeRequest
);

export default router;
