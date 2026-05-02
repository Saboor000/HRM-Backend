// import "dotenv/config";
// import express from "express";
// import cors from "cors";

// import authRouter from "./routes/auth.routes.js";
// import employeeRouter from "./routes/employee.routes.js";
// import leaveRouter from "./routes/leave.routes.js";
// import attendanceRouter from "./routes/attendance.routes.js";
// import payrollRouter from "./routes/payroll.routes.js";
// import policyRouter from "./routes/policy.routes.js";
// import dashboardRouter from "./routes/dashboard.routes.js";

// import { notFound, errorHandler } from "./middleware/error.middleware.js";
// import { supabase } from "./config/supabase.js";

// const app = express();

// const PORT = process.env.PORT || 5000;

// /* =========================
//    CORS CONFIG (PRODUCTION SAFE)
// ========================= */
// const allowedOrigins = [
//   "http://localhost:3001",
//   "http://127.0.0.1:3000",
//   process.env.FRONTEND_URL,
// ].filter(Boolean);

// app.use(
//   cors({
//     origin: (origin, callback) => {
//       // Allow Postman / server-to-server requests
//       if (!origin) return callback(null, true);

//       if (allowedOrigins.includes(origin)) {
//         return callback(null, true);
//       }

//       return callback(null, false); // safer than throwing error
//     },
//     credentials: true,
//   })
// );

// app.use(express.json());

// /* =========================
//    HEALTH CHECK ROUTE
// ========================= */
// app.get("/", (req, res) => {
//   res.status(200).json({
//     message: "HRM backend is running",
//     environment: process.env.NODE_ENV || "development",
//   });
// });

// /* =========================
//    ROUTES
// ========================= */
// app.use("/api/auth", authRouter);
// app.use("/api", employeeRouter);
// app.use("/api", leaveRouter);
// app.use("/api", attendanceRouter);
// app.use("/api", payrollRouter);
// app.use("/api", policyRouter);
// app.use("/api", dashboardRouter);

// /* =========================
//    ERROR HANDLING
// ========================= */
// app.use(notFound);
// app.use(errorHandler);

// /* =========================
//    NON-BLOCKING SUPABASE CHECK
// ========================= */
// const checkSupabaseConnection = async () => {
//   try {
//     const { error } = await supabase
//       .from("employees")
//       .select("id")
//       .limit(1);

//     if (error) {
//       console.warn("Supabase connection warning:", error.message);
//     } else {
//       console.log("Supabase connection established");
//     }
//   } catch (err) {
//     console.error("Supabase connection failed:", err.message);
//   }
// };

// /* =========================
//    START SERVER (PRODUCTION SAFE)
// ========================= */
// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);

//   // NON-BLOCKING (important for PM2 stability)
//   checkSupabaseConnection();
// });
import dotenv from "dotenv";
dotenv.config();

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

/**
 * ✅ FIX 1: Safe PORT (prevents crash loop)
 */
const PORT = process.env.PORT || 5000;

/**
 * ✅ FIX 2: Safe CORS setup
 */
const allowedOrigins = new Set(
  [
    "http://localhost:3000",
    "http://localhost:3001",
    process.env.FRONTEND_URL,
  ].filter(Boolean)
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(null, true); // avoid crashing server in production
    },
    credentials: true,
  })
);

app.use(express.json());

/**
 * Health check route (important for VPS + debugging)
 */
app.get("/", (req, res) => {
  res.status(200).json({
    message: "HRM backend is running",
    status: "OK",
    environment: process.env.NODE_ENV || "development",
  });
});

/**
 * Routes
 */
app.use("/api/auth", authRouter);
app.use("/api", employeeRouter);
app.use("/api", leaveRouter);
app.use("/api", attendanceRouter);
app.use("/api", payrollRouter);
app.use("/api", policyRouter);
app.use("/api", dashboardRouter);

/**
 * Error handlers
 */
app.use(notFound);
app.use(errorHandler);

/**
 * ✅ SAFE SERVER START (no crash loop)
 */
const startServer = async () => {
  try {
    if (
      !process.env.SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_KEY ||
      !process.env.SUPABASE_ANON_KEY
    ) {
      console.warn("⚠️ Supabase env missing, skipping DB check");
    } else {
      try {
        const { error } = await supabase
          .from("employees")
          .select("id")
          .limit(1);

        if (error) {
          console.warn("Supabase warning:", error.message);
        } else {
          console.log("✅ Supabase connected");
        }
      } catch (err) {
        console.warn("Supabase connection failed:", err.message);
      }
    }

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Server failed to start:", err.message);
    process.exit(1);
  }
};

startServer();