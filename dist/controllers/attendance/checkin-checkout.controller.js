import { checkInService, checkOutService, getCurrentStatusService, } from "../../services/attendance/checkin-checkout.service.js";
const send = (res, status, message, data, pagination) => res.status(status).json({
    success: true,
    message,
    ...(data !== undefined ? { data } : {}),
    ...(pagination ? { pagination } : {}),
});
const runAndSend = (service, successStatus, successMessage) => async (req, res, next) => {
    try {
        const data = await service(req);
        send(res, successStatus, successMessage, data);
    }
    catch (err) {
        next(err);
    }
};
export const checkIn = runAndSend((req) => checkInService(req.user.id, req.body), 201, "Checked in successfully");
export const checkOut = runAndSend((req) => checkOutService(req.user.id, req.body), 200, "Checked out successfully");
export const getCurrentStatus = runAndSend((req) => getCurrentStatusService(req.user.id), 200, "Current status retrieved successfully");
//# sourceMappingURL=checkin-checkout.controller.js.map