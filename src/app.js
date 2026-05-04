import "dotenv/config";
import express from "express";
import cors from "cors";

import authRouter from "./routes/auth.routes.js";
import employeeRouter from "./routes/employee.routes.js";
import leaveRouter from "./routes/leave.routes.js";
import attendanceRouter from "./routes/attendance.routes.js";
import payrollRouter from "./routes/payroll.routes.js";
import policyRouter from "./routes/policy.routes.js";
import dashboardRouter from "./routes/dashboard.routes.js";

import { notFound, errorHandler } from "./middleware/error.middleware.js";
import { supabase } from "./config/supabase.js";

const app = express();

const PORT = process.env.PORT || 4000;

/* =========================
   CORS CONFIG (PRODUCTION SAFE)
========================= */
const allowedOrigins = [
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  process.env.FRONTEND_URL,
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow mobile apps, postman, server-to-server
      if (!origin) return callback(null, true);

      const isAllowed = allowedOrigins.some((o) => {
        if (!o) return false;
        return origin.startsWith(o);
      });

      if (isAllowed) {
        return callback(null, true);
      }

      console.log("Blocked CORS origin:", origin);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

// IMPORTANT: handle preflight explicitly
app.options("*", cors());

/* =========================
   HEALTH CHECK ROUTE
========================= */
app.get("/", (req, res) => {
  res.status(200).json({
    message: "HRM backend is running",
    environment: process.env.NODE_ENV || "development",
  });
});

/* =========================
   ROUTES
========================= */
app.use("/api/auth", authRouter);
app.use("/api", employeeRouter);
app.use("/api", leaveRouter);
app.use("/api", attendanceRouter);
app.use("/api", payrollRouter);
app.use("/api", policyRouter);
app.use("/api", dashboardRouter);

/* =========================
   ERROR HANDLING
========================= */
app.use(notFound);
app.use(errorHandler);

/* =========================
   START SERVER (PRODUCTION SAFE)
========================= */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
