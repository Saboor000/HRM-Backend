import { Router } from "express";
import { authorize } from "../../middleware/auth.middleware.js";
import { validateBody, validateParams, validateQuery } from "../../middleware/validateRequest.middleware.js";
import { createOvertimeRequest, getOvertimeRequests, getMyOvertimeRequests, getOvertimeRequestById, approveOvertimeRequest, rejectOvertimeRequest, managerOvertimeAction, hrOvertimeAction, cancelOvertimeRequest, } from "../../controllers/attendance/overtime-request.controller.js";
import { createOvertimeRequestSchema, overtimeRequestIdParamSchema, overtimeDecisionSchema, overtimeRequestQuerySchema, } from "../../validators/attendance.validator.js";
const router = Router();
const adminHr = authorize("admin", "hr");
const adminHrManager = authorize("admin", "hr", "manager");
const validateOvertimeRequestId = validateParams(overtimeRequestIdParamSchema);
router.post("/attendance/overtime-requests", validateBody(createOvertimeRequestSchema), createOvertimeRequest);
router.get("/attendance/overtime-requests", adminHrManager, validateQuery(overtimeRequestQuerySchema), getOvertimeRequests);
router.get("/attendance/overtime-requests/me", getMyOvertimeRequests);
router.get("/attendance/overtime-requests/:id", adminHrManager, validateOvertimeRequestId, getOvertimeRequestById);
router.patch("/attendance/overtime-requests/:id/manager-action", authorize("admin", "manager"), validateOvertimeRequestId, validateBody(overtimeDecisionSchema), managerOvertimeAction);
router.patch("/attendance/overtime-requests/:id/hr-action", adminHr, validateOvertimeRequestId, validateBody(overtimeDecisionSchema), hrOvertimeAction);
router.put("/attendance/overtime-requests/:id/cancel", validateOvertimeRequestId, cancelOvertimeRequest);
export default router;
//# sourceMappingURL=overtime-request.routes.js.map