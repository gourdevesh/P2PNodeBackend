import express from "express";
import { login, register } from "../controller/user/authController.js"
import { authenticateUser } from "../middleware/authMiddleware.js";
import { verifyEmailOtp } from "../controller/OtpController.js";
const router = express.Router();
router.post("/auth/register", register);
router.post("/auth/login", login);
router.post("/verify-email-otp", authenticateUser, verifyEmailOtp);


export default router;
