import express from "express";
import {
  signin,
  getUserDetails,
  createUserByAdmin,
  getUsersByAdmin,
  getUserByIdByAdmin,
  updateUserByAdmin,
  deleteUserByAdmin,
} from "../controllers/auth.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";
import { validateBody, validateParams } from "../middleware/validateRequest.middleware.js";
import {
  signinSchema,
  adminCreateUserSchema,
  userIdParamSchema,
  adminUpdateUserSchema,
} from "../validators/auth.validator.js";

const authRouter = express.Router();
const adminOnly = [protect, authorize("admin")];
const validateUserId = validateParams(userIdParamSchema);

authRouter.post("/signin", validateBody(signinSchema), signin);
authRouter.post(
  "/admin/users",
  ...adminOnly,
  validateBody(adminCreateUserSchema),
  createUserByAdmin
);
authRouter.get("/admin/users", ...adminOnly, getUsersByAdmin);
authRouter.get(
  "/admin/users/:id",
  ...adminOnly,
  validateUserId,
  getUserByIdByAdmin
);
authRouter.put(
  "/admin/users/:id",
  ...adminOnly,
  validateUserId,
  validateBody(adminUpdateUserSchema),
  updateUserByAdmin
);
authRouter.delete(
  "/admin/users/:id",
  ...adminOnly,
  validateUserId,
  deleteUserByAdmin
);
authRouter.get("/user", protect, getUserDetails);

export default authRouter;
