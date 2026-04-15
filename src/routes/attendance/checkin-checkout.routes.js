import { Router } from "express";
import { validateBody } from "../../middleware/validateRequest.middleware.js";
import {
  checkIn,
  checkOut,
  getCurrentStatus,
} from "../../controllers/attendance/checkin-checkout.controller.js";
import { checkInSchema, checkOutSchema } from "../../validators/attendance.validator.js";

const router = Router();

router.post("/attendance/check-in", validateBody(checkInSchema), checkIn);
router.post("/attendance/check-out", validateBody(checkOutSchema), checkOut);
router.get("/attendance/status", getCurrentStatus);

export default router;
