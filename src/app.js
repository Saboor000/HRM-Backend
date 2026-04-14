import dotenv from "dotenv";
import express from "express";
import cors from "cors";

import authRouter from "./routes/auth.routes.js";
import { notFound, errorHandler } from "./middleware/error.middleware.js";
import { supabase } from "./config/supabase.js";
import employeeRouter from "./routes/employee.routes.js";
import leaveRouter from "./routes/leave.routes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT;

app.use(cors());
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

app.use(notFound);
app.use(errorHandler);

const startServer = async () => {
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
		console.log(`Server running on port ${PORT}`);
	});
};

startServer();
