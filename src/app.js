import express from "express";
import cors from "cors";
import dotenv from "dotenv";
// import userRoutes from "./routes/userRoutes.js";
import adminRouter from "./routes/adminRoutes.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Test route
app.get("/", (req, res) => {
    res.send("API is running...");
});
 
app.use("/api", adminRouter);  // optional: /api prefix


// 404 handler
app.use((req, res) => {
    res.status(404).json({ status: false, message: "Route not found" });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ status: false, message: "Server error", errors: err.message });
});

export default app;
