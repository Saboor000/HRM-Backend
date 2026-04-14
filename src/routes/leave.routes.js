import { Router } from "express";
import { authorize, protect } from "../middleware/auth.middleware.js";
import {
  applyLeave,
  approveLeave,
  cancelLeave,
  getLeaveById,
  getLeaves,
  getMyLeaves,
  rejectLeave,
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
  rejectLeaveSchema,
} from "../validators/leave.validator.js";

const leaveRouter = Router();

leaveRouter.use(protect);

leaveRouter.post("/leave/apply", validateBody(createLeaveSchema), applyLeave);
leaveRouter.get("/leave/my", validateQuery(leaveListQuerySchema), getMyLeaves);
leaveRouter.get("/leave/:id", validateParams(leaveIdParamSchema), getLeaveById);
leaveRouter.patch(
  "/leave/:id/cancel",
  validateParams(leaveIdParamSchema),
  validateBody(cancelLeaveSchema),
  cancelLeave,
);
leaveRouter.get(
  "/leaves",
  authorize("admin", "hr"),
  validateQuery(leaveListQuerySchema),
  getLeaves,
);
leaveRouter.patch(
  "/leave/:id/approve",
  authorize("admin","hr"),
  validateParams(leaveIdParamSchema),
  approveLeave,
);
leaveRouter.patch(
  "/leave/:id/reject",
  authorize("admin", "hr"),
  validateParams(leaveIdParamSchema),
  validateBody(rejectLeaveSchema),
  rejectLeave,
);

export default leaveRouter;
