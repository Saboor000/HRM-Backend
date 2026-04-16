import { Router } from "express";
import { validateBody } from "../../middleware/validateRequest.middleware.js";
import {
  checkIn,
  checkOut,
  getCurrentStatus,
} from "../../controllers/attendance/checkin-checkout.controller.js";
import {
  checkInSchema,
  checkOutSchema,
} from "../../validators/attendance.validator.js";

const router = Router();
const validateCheckIn = validateBody(checkInSchema);
const validateCheckOut = validateBody(checkOutSchema);

router.post("/attendance/check-in", validateCheckIn, checkIn);
router.post("/attendance/check-out", validateCheckOut, checkOut);
router.get("/attendance/status", getCurrentStatus);

export default router;
