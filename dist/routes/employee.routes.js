import express from "express";
import { createEmployee, getAllEmployees, getEmployeeById, updateEmployee, deleteEmployee, } from "../controllers/employee.controller.js";
import { authorize, protect } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/upload.middleware.js";
import { validateBody, validateParams, validateQuery } from "../middleware/validateRequest.middleware.js";
import { createEmployeeSchema, updateEmployeeSchema, employeeIdParamSchema, employeeListQuerySchema, } from "../validators/employee.validator.js";
const employeeRouter = express.Router();
const adminHr = authorize("admin", "hr");
const validateEmployeeId = validateParams(employeeIdParamSchema);
employeeRouter.use(protect);
const uploadFields = upload.fields([
    { name: "cnic", maxCount: 1 },
    { name: "degree", maxCount: 1 },
    { name: "passport", maxCount: 1 },
    { name: "profilePic", maxCount: 1 },
    { name: "contract", maxCount: 1 },
    { name: "otherDocs", maxCount: 5 },
]);
employeeRouter.post("/employee", adminHr, uploadFields, validateBody(createEmployeeSchema), createEmployee);
employeeRouter.get("/employee", adminHr, validateQuery(employeeListQuerySchema), getAllEmployees);
employeeRouter.get("/employee/:id", adminHr, validateEmployeeId, getEmployeeById);
employeeRouter.put("/employee/:id", adminHr, uploadFields, validateEmployeeId, validateBody(updateEmployeeSchema), updateEmployee);
employeeRouter.delete("/employee/:id", authorize("admin"), validateEmployeeId, deleteEmployee);
export default employeeRouter;
//# sourceMappingURL=employee.routes.js.map