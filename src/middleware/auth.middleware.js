import jwt from "jsonwebtoken";
import { supabase } from "../config/supabase.js";

const extractBearerToken = (authorization = "") =>
  authorization.startsWith("Bearer ") ? authorization.split(" ")[1] : null;
const forbidden = (res, payload) => res.status(403).json(payload);

export const protect = (req, res, next) => {
  const token = extractBearerToken(req.headers.authorization || "");

  if (!token) {
    return res.status(401).json({ message: "Access denied. Token missing" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded?.auth_id && !decoded?.id) decoded.id = decoded.auth_id;
    if (decoded?.id && !decoded?.auth_id) decoded.auth_id = decoded.id;

    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

export const authorize = (...designations) => {
  return async (req, res, next) => {
    try {
      const { data: employee, error } = await supabase
        .from("employees")
        .select("designation")
        .eq("auth_id", req.user.auth_id)
        .is("deleted_at", null)
        .single();

      if (error || !employee) {
        return forbidden(res, {
          success: false,
          message: "Forbidden: Employee record not found",
        });
      }

      if (!designations.includes(employee.designation)) {
        return forbidden(res, {
          success: false,
          message: `Forbidden: Only ${designations.join(", ")} can access this resource`,
          required_designation: designations,
          user_designation: employee.designation,
        });
      }

      req.user.designation = employee.designation;
      return next();
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Authorization check failed",
        error: err.message,
      });
    }
  };
};

