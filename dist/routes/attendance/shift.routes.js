import { Router } from "express";
import { authorize } from "../../middleware/auth.middleware.js";
import { validateBody, validateParams, } from "../../middleware/validateRequest.middleware.js";
import { createShift, getShifts, getMyShifts, getShiftById, updateShift, toggleShiftStatus, deleteShift, } from "../../controllers/attendance/shift.controller.js";
import { createShiftSchema, updateShiftSchema, shiftStatusSchema, shiftIdParamSchema, } from "../../validators/attendance.validator.js";
const router = Router();
const adminHr = authorize("admin", "hr");
const adminHrManager = authorize("admin", "hr", "manager");
const validateShiftId = validateParams(shiftIdParamSchema);
router.post("/attendance/shifts", adminHr, validateBody(createShiftSchema), createShift);
router.get("/attendance/shifts", adminHrManager, getShifts);
router.get("/attendance/shifts/me", getMyShifts);
router.get("/attendance/shifts/:id", adminHrManager, validateShiftId, getShiftById);
router.put("/attendance/shifts/:id", adminHr, validateShiftId, validateBody(updateShiftSchema), updateShift);
router.patch("/attendance/shifts/:id/status", adminHr, validateShiftId, validateBody(shiftStatusSchema), toggleShiftStatus);
router.delete("/attendance/shifts/:id", adminHr, validateShiftId, deleteShift);
export default router;
//# sourceMappingURL=shift.routes.js.map