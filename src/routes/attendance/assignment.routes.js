import { Router } from "express";
import { authorize } from "../../middleware/auth.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middleware/validateRequest.middleware.js";
import {
  assignShift,
  getAssignments,
  getMyAssignments,
  updateAssignment,
} from "../../controllers/attendance/assignment.controller.js";
import {
  assignShiftSchema,
  updateAssignmentSchema,
  assignmentIdParamSchema,
  assignmentListQuerySchema,
} from "../../validators/attendance.validator.js";

const router = Router();
const adminHr = authorize("admin", "hr");
const adminHrManager = authorize("admin", "hr", "manager");
const validateAssignmentId = validateParams(assignmentIdParamSchema);

router.post("/attendance/assignments", adminHr, validateBody(assignShiftSchema), assignShift);
router.get(
  "/attendance/assignments",
  adminHrManager,
  validateQuery(assignmentListQuerySchema),
  getAssignments,
);
router.get("/attendance/assignments/me", getMyAssignments);
router.put(
  "/attendance/assignments/:id",
  adminHr,
  validateAssignmentId,
  validateBody(updateAssignmentSchema),
  updateAssignment,
);

export default router;
