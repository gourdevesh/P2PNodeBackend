import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { body } from "express-validator";
import { loginAdmin, logOut, registerAdmin } from "../controller/admin/authController.js";
import { adminDetail, changePassword, getAllAdmin, updateProfile } from "../controller/admin/adminController.js";
import { authenticateAdmin } from "../middleware/authMiddleware.js";
import { getSettingData, getWalletKeyPhrase, updateSettingData, walletKeyPhrase } from "../controller/admin/systemController.js";
import { getAllUsersTickets, getParticularTicket, closeTicket } from "../controller/admin/supportTicketController.js";
import { getAddressVerificationDetails, getIdVerificationDetails, verifyAddress, verifyId } from "../controller/admin/idAddressVerificationController.js";
import { getUser, loginHistory, updateUserStatus, userDetail } from "../controller/admin/userDetailsController.js";
import { getTransactionDetails, getWalletDetails } from "../controller/admin/WalletTransactionController.js";
import { completeRequestedPendingTrade, getCryptoAd, getTradeHistory, updateCryptoAdStatus } from "../controller/admin/CryptoOfferTradeController.js";
import { getPaymentDetails, getUpiDetails, updatePaymentDetailsStatus, updateUpiDetailsStatus } from "../controller/admin/PaymentMethodController.js";
import { formData, validateUpdatePaymentStatus } from "../middleware/validation.js";
import { getWebsiteDetails, updateLogoFavicon, updateNameUrlTitle, uploadMultiple } from "../controller/admin/WebsiteController.js";
import moment from "moment";
import { getAdminAssets } from "../controller/admin/AdminAssetController.js";
import { get } from "http";
import { getCountries, getCountriesCurrency, getCountriesDialingCode, getTimezone } from "../controller/CountryController.js";
import { deleteNotification, storeNotification } from "../controller/admin/AdminNotificationController.js";
import { getDashboard } from "../controller/admin/DashboardController.js";

const router = express.Router();
const storageDir = path.join("storage", "app", "public", "images", "profile_image");
fs.mkdirSync(storageDir, { recursive: true });

// ✅ Multer config (Laravel-style)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, storageDir),
  filename: (req, file, cb) => {
    const adminId = req.admin?.id || "unknown";
    const timestamp = moment().format("DDMMYYYYHHmm");
    const ext = path.extname(file.originalname);
    cb(null, `${adminId}_${timestamp}${ext}`);
  },
});

export const uploadImage = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only jpeg, png, jpg formats are allowed."));
    }
    cb(null, true);
  },
});


// Admin Register
router.post(
  "/admin/auth/register",
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
  "/admin/auth/login", formData,
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
router.get("/admin/user/login-history/:id", authenticateAdmin, loginHistory);
router.get("/admin/user/user-details", authenticateAdmin, userDetail);
router.get("/admin/transaction/get-wallet-details", authenticateAdmin, getWalletDetails);
router.get("/admin/transaction/get-transaction-details", authenticateAdmin, getTransactionDetails);
router.get("/admin/trade/get-trade-history", authenticateAdmin, getTradeHistory);
router.get("/admin/account-details/get-payment-details", authenticateAdmin, getPaymentDetails);
router.get("/admin/account-details/get-upi-details", authenticateAdmin, getUpiDetails);
router.get("/admin/setting/get-walletKeyPhrase", authenticateAdmin, getWalletKeyPhrase);
router.post("/admin/account-details/update-payment-details-status", formData, authenticateAdmin, validateUpdatePaymentStatus, updatePaymentDetailsStatus);
router.post("/admin/account-details/update-upi-details-status", formData, authenticateAdmin, validateUpdatePaymentStatus, updateUpiDetailsStatus);
router.post("/admin/user/update-user-status", authenticateAdmin, updateUserStatus);
router.post("/admin/profile/change-password", authenticateAdmin, changePassword);
router.post("/admin/setting/update-setting-data", authenticateAdmin, updateSettingData);
router.post("/admin/verification/verify-address", authenticateAdmin, verifyAddress);
router.post("/admin/verification/verify-id", authenticateAdmin, verifyId);
router.post("/admin/support-tickets/close-ticket", authenticateAdmin, closeTicket);
router.post("/admin/website/update-nameTitleUrl", authenticateAdmin, updateNameUrlTitle);
router.get("/admin/website/details", authenticateAdmin, getWebsiteDetails);
router.post("/admin/profile/update-profile", uploadImage.single("profile_image"), authenticateAdmin, updateProfile);
router.get("/admin/admin-wallet/get-assets-details", authenticateAdmin, getAdminAssets);
router.get("/admin/crypto-advertisement/crypto-ad", authenticateAdmin, getCryptoAd);
router.get("/countries/currency", authenticateAdmin, getCountriesCurrency);
router.get("/countries/dialing-code", authenticateAdmin, getCountriesDialingCode);
router.get("/countries/name", authenticateAdmin, getCountries);
router.get("/countries/timezone", authenticateAdmin, getTimezone);
router.post("/admin/website/update-logo-favicon", authenticateAdmin, uploadMultiple, updateLogoFavicon);
router.post("/admin/notifications", authenticateAdmin, storeNotification);
router.delete("/admin/delete-notifications/:id", authenticateAdmin, deleteNotification);
router.delete("/admin/auth/logout", authenticateAdmin, logOut);
router.post("/admin/crypto-advertisement/toggle-cryptoAd-active", authenticateAdmin, updateCryptoAdStatus);
router.get("/admin/dashboard", authenticateAdmin, getDashboard);
router.post("/admin/trade/complete-requested-trade", authenticateAdmin, completeRequestedPendingTrade);
router.post("/admin/setting/update-walletKeyPhrase", authenticateAdmin, walletKeyPhrase);



export default router;
