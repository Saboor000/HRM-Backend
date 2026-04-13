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
import { protect, authorize } from "../middleware/authMiddleware.js";
import { validateBody, validateParams } from "../middleware/validateRequest.js";
import {
	signinSchema,
	adminCreateUserSchema,
	userIdParamSchema,
	adminUpdateUserSchema,
} from "../validators/auth.validator.js";

const authRouter = express.Router();

authRouter.post("/signin", validateBody(signinSchema), signin);
authRouter.post(
	"/admin/users",
	protect,
	authorize("admin"),
	validateBody(adminCreateUserSchema),
	createUserByAdmin
);
authRouter.get("/admin/users", protect, authorize("admin"), getUsersByAdmin);
authRouter.get(
	"/admin/users/:id",
	protect,
	authorize("admin"),
	validateParams(userIdParamSchema),
	getUserByIdByAdmin
);
authRouter.put(
	"/admin/users/:id",
	protect,
	authorize("admin"),
	validateParams(userIdParamSchema),
	validateBody(adminUpdateUserSchema),
	updateUserByAdmin
);
authRouter.delete(
	"/admin/users/:id",
	protect,
	authorize("admin"),
	validateParams(userIdParamSchema),
	deleteUserByAdmin
);
authRouter.get("/user", protect, getUserDetails);

export default authRouter;
