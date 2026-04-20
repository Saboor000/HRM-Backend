import express from "express";
import {
  approvePayroll,
  createSalaryStructure,
  generatePayroll,
  getPayrollByEmployee,
  getMyPayroll,
  getSalaryStructureByEmployee,
  getSalaryStructureById,
  getSalaryStructures,
  getPayslip,
  markPayrollPaid,
  regeneratePayroll,
  updateSalaryStructure,
} from "../controllers/payroll.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validateRequest.middleware.js";
import {
  generatePayrollSchema,
  salaryStructureCreateSchema,
  salaryStructureEmployeeParamSchema,
  salaryStructureIdParamSchema,
  salaryStructureListQuerySchema,
  salaryStructureUpdateSchema,
  payrollEmployeeParamSchema,
  payrollEmployeeQuerySchema,
  payrollIdParamSchema,
} from "../validators/payroll.validator.js";

const payrollRouter = express.Router();
const adminHr = authorize("admin", "hr");
const adminHrEmployee = authorize("admin", "hr", "employee");
const validatePayrollId = validateParams(payrollIdParamSchema);

payrollRouter.use(protect);

payrollRouter.post(
  "/salary-structures",
  adminHr,
  validateBody(salaryStructureCreateSchema),
  createSalaryStructure
);
payrollRouter.get(
  "/salary-structures",
  adminHr,
  validateQuery(salaryStructureListQuerySchema),
  getSalaryStructures
);
payrollRouter.get(
  "/salary-structures/employee/:employee_id",
  adminHrEmployee,
  validateParams(salaryStructureEmployeeParamSchema),
  getSalaryStructureByEmployee
);
payrollRouter.get(
  "/salary-structures/:id",
  adminHr,
  validateParams(salaryStructureIdParamSchema),
  getSalaryStructureById
);
payrollRouter.patch(
  "/salary-structures/:id",
  adminHr,
  validateParams(salaryStructureIdParamSchema),
  validateBody(salaryStructureUpdateSchema),
  updateSalaryStructure
);

payrollRouter.post(
  "/payroll/generate",
  adminHr,
  validateBody(generatePayrollSchema),
  generatePayroll
);

payrollRouter.post(
  "/payroll/:id/regenerate",
  adminHr,
  validatePayrollId,
  regeneratePayroll
);

payrollRouter.get(
  "/payroll/me",
  adminHrEmployee,
  validateQuery(payrollEmployeeQuerySchema),
  getMyPayroll
);

payrollRouter.get(
  "/payroll/:employeeId",
  adminHrEmployee,
  validateParams(payrollEmployeeParamSchema),
  validateQuery(payrollEmployeeQuerySchema),
  getPayrollByEmployee
);

payrollRouter.post(
  "/payroll/:id/approve",
  adminHr,
  validatePayrollId,
  approvePayroll
);

payrollRouter.post(
  "/payroll/:id/mark-paid",
  adminHr,
  validatePayrollId,
  markPayrollPaid
);

payrollRouter.get(
  "/payslip/:id",
  adminHrEmployee,
  validatePayrollId,
  getPayslip
);

export default payrollRouter;