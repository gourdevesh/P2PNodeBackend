import express from "express";
import { body } from "express-validator";
import { loginAdmin, registerAdmin } from "../admin/authController.js";
import { adminDetail, getAllAdmin } from "../Admin/adminController.js";
import { authenticateAdmin } from "../middleware/authMiddleware.js";
import { getSettingData } from "../admin/systemController.js";
import { getAllUsersTickets, getParticularTicket } from "../admin/supportTicketController.js";
import { getAddressVerificationDetails, getIdVerificationDetails } from "../admin/idAddressVerificationController.js";
import { getUser } from "../admin/userDetailsController.js";

const router = express.Router();

// Admin Register
router.post(
  "/auth/register",
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("phone_number").notEmpty().withMessage("Phone number is required"),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters")
      .matches(/[A-Z]/)
      .withMessage("Password must contain at least one uppercase letter")
      .matches(/[a-z]/)
      .withMessage("Password must contain at least one lowercase letter")
      .matches(/[0-9]/)
      .withMessage("Password must contain at least one number")
      .matches(/[!@#$%^&*(),.?":{}|<>_]/)
      .withMessage("Password must contain at least one special character"),
    body("role")
      .isIn(["admin", "sub_admin"])
      .withMessage("Role must be admin or sub_admin"),
  ],
  registerAdmin
);

// Admin Login
router.post(
  "/auth/login",
  [
    body("username").notEmpty().withMessage("Username (email or phone) is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  loginAdmin
);
router.get("/profile/admin-details", authenticateAdmin, adminDetail);
router.get("/admin/all-admin-details", authenticateAdmin, getAllAdmin);
router.get("/admin/setting/get-setting-data", authenticateAdmin, getSettingData);
router.get("/admin/support-ticket/get-tickets", authenticateAdmin, getAllUsersTickets);
router.get("/admin/support-tickets/get-particular-ticket/:id", authenticateAdmin, getParticularTicket);
router.get("/admin/verification/get-address-verification-details", authenticateAdmin, getAddressVerificationDetails);
router.get("/admin/verification/get-id-verification-details", authenticateAdmin, getIdVerificationDetails);
router.get("/admin/user/user-detail/:id", authenticateAdmin, getUser);




export default router;
