// routes/employee.routes.js
import express from "express";
import {
  createEmployee,
  getAllEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
} from "../controllers/employee.controller.js";

import { protect } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/authMiddleware.js";
import { upload } from "../middleware/uploadMiddleware.js";
import { validateBody, validateParams, validateQuery } from "../middleware/validateRequest.js";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  employeeIdParamSchema,
  employeeListQuerySchema,
} from "../validators/employee.validator.js";

const employeeRouter = express.Router();

employeeRouter.use(protect);

// 🔥 File Upload Fields
const uploadFields = upload.fields([
  { name: "cnic", maxCount: 1 },
  { name: "degree", maxCount: 1 },
  { name: "passport", maxCount: 1 },
  { name: "profilePic", maxCount: 1 },
  { name: "contract", maxCount: 1 },
  { name: "otherDocs", maxCount: 5 },
]);

// HR/Admin
employeeRouter.post(
  "/employee",
  authorize("admin", "hr"),
  uploadFields,
  validateBody(createEmployeeSchema),
  createEmployee,
);

employeeRouter.get(
  "/employee",
  authorize("admin", "hr"),
  validateQuery(employeeListQuerySchema),
  getAllEmployees,
);

employeeRouter.get(
  "/employee/:id",
  authorize("admin", "hr"),
  validateParams(employeeIdParamSchema),
  getEmployeeById,
);

employeeRouter.put(
  "/employee/:id",
  authorize("admin", "hr"),
  validateParams(employeeIdParamSchema),
  validateBody(updateEmployeeSchema),
  updateEmployee,
);

employeeRouter.delete(
  "/employee/:id",
  authorize("admin"),
  validateParams(employeeIdParamSchema),
  deleteEmployee,
);

export default employeeRouter;
