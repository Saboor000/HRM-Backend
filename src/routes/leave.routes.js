import { Router } from "express";
import { authorize, protect } from "../middleware/auth.middleware.js";
import {
  applyLeave,
  cancelLeave,
  getLeaveById,
  getLeaves,
  hrLeaveAction,
  managerLeaveAction,
  getMyLeaves,
} from "../controllers/leave.controller.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validateRequest.middleware.js";
import {
  cancelLeaveSchema,
  createLeaveSchema,
  leaveIdParamSchema,
  leaveListQuerySchema,
  leaveDecisionSchema,
} from "../validators/leave.validator.js";

const leaveRouter = Router();
const validateLeaveId = validateParams(leaveIdParamSchema);
const adminHr = authorize("admin", "hr");
const adminHrManager = authorize("admin", "hr", "manager");

leaveRouter.use(protect);

leaveRouter.post("/leave/apply", validateBody(createLeaveSchema), applyLeave);
leaveRouter.get("/leave/my", validateQuery(leaveListQuerySchema), getMyLeaves);
leaveRouter.get("/leave/:id", validateLeaveId, getLeaveById);
leaveRouter.patch(
  "/leave/:id/cancel",
  validateLeaveId,
  validateBody(cancelLeaveSchema),
  cancelLeave,
);
leaveRouter.get(
  "/leaves",
  adminHrManager,
  validateQuery(leaveListQuerySchema),
  getLeaves,
);
leaveRouter.patch(
  "/leave/:id/manager-action",
  authorize("admin", "manager"),
  validateLeaveId,
  validateBody(leaveDecisionSchema),
  managerLeaveAction,
);
leaveRouter.patch(
  "/leave/:id/hr-action",
  adminHr,
  validateLeaveId,
  validateBody(leaveDecisionSchema),
  hrLeaveAction,
);

export default leaveRouter;
