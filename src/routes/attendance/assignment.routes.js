import { Router } from "express";
import { authorize } from "../../middleware/auth.middleware.js";
import { validateBody, validateParams, validateQuery } from "../../middleware/validateRequest.middleware.js";
import {
  assignShift,
  getAssignments,
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

router.post("/attendance/assignments", adminHr, validateBody(assignShiftSchema), assignShift);
router.get("/attendance/assignments", validateQuery(assignmentListQuerySchema), getAssignments);
router.put(
  "/attendance/assignments/:id",
  adminHr,
  validateParams(assignmentIdParamSchema),
  validateBody(updateAssignmentSchema),
  updateAssignment
);

export default router;
