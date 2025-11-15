import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import multer from "multer";
import swaggerUi from "swagger-ui-express";
import fs from "fs";
// import userRoutes from "./routes/userRoutes.js";
import adminRouter from "./routes/adminRoutes.js";
import usersRouter from "./routes/userRoutes.js";
BigInt.prototype.toJSON = function () {
  return this.toString();
};
dotenv.config();

const app = express();

// 🧩 Setup multer to handle multipart/form-data (no files)
const upload = multer();

// Static files
app.use("/storage", express.static(path.join(process.cwd(), "storage", "app", "public")));

// Middlewares
app.use(cors());
app.use(express.json()); // for JSON requests
app.use(express.urlencoded({ extended: true })); // for URL-encoded forms

// 🧾 Swagger setup
const swaggerPath = path.resolve("storage/api-docs/api-docs.json");
const swaggerDocument = JSON.parse(fs.readFileSync(swaggerPath, "utf8"));

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get("/docs/api-docs.json", (req, res) => {
  if (!fs.existsSync(swaggerPath)) {
    return res.status(404).json({
      message: "Swagger JSON not found. Please check your file path.",
    });
  }
  res.sendFile(swaggerPath);
});

// ✅ Test route
app.get("/", (req, res) => {
  res.send("API is running...");
});

// ✅ All your routes
app.use("/api", adminRouter);
app.use("/api", usersRouter);


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
