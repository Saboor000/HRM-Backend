import * as PolicyService from '../services/policy.service.js';
const createPolicyController = (serviceFunction, message = 'Policy created successfully') => async (req, res, next) => {
    try {
        const policy = await serviceFunction(req.body);
        res.status(201).json({ message, policy });
    }
    catch (error) {
        next(error);
    }
};
const getPolicyController = (serviceFunction, message = 'Policy retrieved successfully') => async (req, res, next) => {
    try {
        const policy = await serviceFunction(req.params.id);
        res.status(200).json({ message, policy });
    }
    catch (error) {
        next(error);
    }
};
const listPolicyController = (serviceFunction, message = 'Policies retrieved successfully') => async (req, res, next) => {
    try {
        const policies = await serviceFunction();
        res.status(200).json({ message, policies });
    }
    catch (error) {
        next(error);
    }
};
const updatePolicyController = (serviceFunction, message = 'Policy updated successfully') => async (req, res, next) => {
    try {
        const policy = await serviceFunction(req.params.id, req.body);
        res.status(200).json({ message, policy });
    }
    catch (error) {
        next(error);
    }
};
const deletePolicyController = (serviceFunction, message = 'Policy deleted successfully') => async (req, res, next) => {
    try {
        const policy = await serviceFunction(req.params.id);
        res.status(200).json({ message, policy });
    }
    catch (error) {
        next(error);
    }
};
export const createAttendancePolicy = createPolicyController(PolicyService.createAttendancePolicy, 'Attendance policy created successfully');
export const updateAttendancePolicy = updatePolicyController(PolicyService.updateAttendancePolicy, 'Attendance policy updated successfully');
export const getAttendancePolicies = listPolicyController(PolicyService.listAttendancePolicies);
export const getAttendancePolicyById = getPolicyController(PolicyService.getAttendancePolicyById);
export const deleteAttendancePolicy = deletePolicyController(PolicyService.deleteAttendancePolicy);
export const createOvertimePolicy = createPolicyController(PolicyService.createOvertimePolicy, 'Overtime policy created successfully');
export const updateOvertimePolicy = updatePolicyController(PolicyService.updateOvertimePolicy);
export const getOvertimePolicies = listPolicyController(PolicyService.listOvertimePolicies);
export const getOvertimePolicyById = getPolicyController(PolicyService.getOvertimePolicyById);
export const deleteOvertimePolicy = deletePolicyController(PolicyService.deleteOvertimePolicy);
export const createTaxPolicy = createPolicyController(PolicyService.createTaxPolicy, 'Tax policy created successfully');
export const updateTaxPolicy = updatePolicyController(PolicyService.updateTaxPolicy);
export const getTaxPolicies = listPolicyController(PolicyService.listTaxPolicies);
export const getTaxPolicyById = getPolicyController(PolicyService.getTaxPolicyById);
export const deleteTaxPolicy = deletePolicyController(PolicyService.deleteTaxPolicy);
export const createBonusPolicy = createPolicyController(PolicyService.createBonusPolicy, 'Bonus policy created successfully');
export const updateBonusPolicy = updatePolicyController(PolicyService.updateBonusPolicy);
export const getBonusPolicies = listPolicyController(PolicyService.listBonusPolicies);
export const getBonusPolicyById = getPolicyController(PolicyService.getBonusPolicyById);
export const deleteBonusPolicy = deletePolicyController(PolicyService.deleteBonusPolicy);
//# sourceMappingURL=policy.controller.js.map