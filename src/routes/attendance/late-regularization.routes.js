import { Router } from "express";
import { authorize } from "../../middleware/auth.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middleware/validateRequest.middleware.js";
import {
  listLateRegularizations,
  reviewLateRegularization,
  submitLateRegularization,
} from "../../controllers/attendance/late-regularization.controller.js";
import {
  lateRegularizationListQuerySchema,
  lateRegularizationReviewSchema,
  lateRegularizationSubmitSchema,
  regularizationIdParamSchema,
} from "../../validators/attendance.validator.js";

const router = Router();
const hrAdmin = authorize("hr", "admin");

router.get(
  "/attendance/late-regularizations",
  validateQuery(lateRegularizationListQuerySchema),
  listLateRegularizations
);

router.post(
  "/attendance/late-regularizations",
  upload.array("supporting_documents", 5),
  validateBody(lateRegularizationSubmitSchema),
  submitLateRegularization
);

router.patch(
  "/attendance/late-regularizations/:id/review",
  hrAdmin,
  validateParams(regularizationIdParamSchema),
  validateBody(lateRegularizationReviewSchema),
  reviewLateRegularization
);

export default router;
