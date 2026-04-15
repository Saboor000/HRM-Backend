import { Router } from "express";
import { authorize } from "../../middleware/auth.middleware.js";
import { validateBody, validateParams } from "../../middleware/validateRequest.middleware.js";
import {
  createShift,
  getShifts,
  getShiftById,
  updateShift,
  toggleShiftStatus,
  deleteShift,
} from "../../controllers/attendance/shift.controller.js";
import {
  createShiftSchema,
  updateShiftSchema,
  shiftStatusSchema,
  shiftIdParamSchema,
} from "../../validators/attendance.validator.js";

const router = Router();
const adminHr = authorize("admin", "hr");

router.post("/attendance/shifts", adminHr, validateBody(createShiftSchema), createShift);
router.get("/attendance/shifts", getShifts);
router.get("/attendance/shifts/:id", validateParams(shiftIdParamSchema), getShiftById);
router.put(
  "/attendance/shifts/:id",
  adminHr,
  validateParams(shiftIdParamSchema),
  validateBody(updateShiftSchema),
  updateShift
);
router.patch(
  "/attendance/shifts/:id/status",
  adminHr,
  validateParams(shiftIdParamSchema),
  validateBody(shiftStatusSchema),
  toggleShiftStatus
);
router.delete("/attendance/shifts/:id", adminHr, validateParams(shiftIdParamSchema), deleteShift);

export default router;
