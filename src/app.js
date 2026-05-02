import "dotenv/config";
import express from "express";
import cors from "cors";

import authRouter from "./routes/auth.routes.js";
import { notFound, errorHandler } from "./middleware/error.middleware.js";
import { supabase } from "./config/supabase.js";
import employeeRouter from "./routes/employee.routes.js";
import leaveRouter from "./routes/leave.routes.js";
import attendanceRouter from "./routes/attendance.routes.js";
import payrollRouter from "./routes/payroll.routes.js";
import policyRouter from "./routes/policy.routes.js";
import dashboardRouter from "./routes/dashboard.routes.js";

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = new Set([
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  process.env.FRONTEND_URL,
].filter(Boolean));

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (curl/Postman) where Origin header may be absent.
      if (!origin) return callback(null, true);

      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS policy: origin not allowed"));
    },
    credentials: true,
  })
);
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({
    message: "HRM backend is running",
    environment: process.env.NODE_ENV || "development",
  });
});

app.use("/api/auth", authRouter);
app.use("/api", employeeRouter);
app.use("/api", leaveRouter);
app.use("/api", attendanceRouter);
app.use("/api", payrollRouter);
app.use("/api", policyRouter);
app.use("/api", dashboardRouter);
app.use(notFound);
app.use(errorHandler);

try {
  const { error } = await supabase.from("employees").select("id").limit(1);

  if (error) {
    console.warn(`Supabase connection check warning: ${error.message}`);
  } else {
    console.log("Supabase connection established");
  }
} catch (error) {
  console.error(`Supabase connection failed: ${error.message}`);
}

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
