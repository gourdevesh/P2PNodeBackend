import express from "express";

import { authenticateUser } from "../middleware/authMiddleware.js";
import { sendEmailOtp, verifyEmailOtp } from "../controller/OtpController.js";
import { login, register } from "../controller/user/AuthController.js";
import { changePassword, getReferralLink, getSecurityQuestion, loginHistory, securityQuestion, updateBio, updateProfileImage, updateUsername, userDetail } from "../controller/user/UserController.js";
import { addressVerification, getAddressVerification, getIdDetails, storeAddress } from "../controller/user/AddressVerificationController.js";
import { singelUpload, upload } from "../middleware/upload.js";
import { addUpiDetails, getPaymentDetails, getUpiDetails, storePaymentDetails } from "../controller/user/PaymentController.js";
import { formData, validateBio, validateChangePassword, validateSecurityQuestions, validateUsername } from "../middleware/validation.js";
import { uploadImage } from "./adminRoutes.js";
import { createCryptoAd, getCryptoAd, getMyCryptoAd } from "../controller/user/CryptoAdController.js";
const router = express.Router();
router.post("/auth/register", register);
router.post("/auth/login", login);
router.post("/verify-email-otp", authenticateUser, verifyEmailOtp);
router.post("/send-email-otp", authenticateUser, sendEmailOtp);
router.get("/user-details", authenticateUser, userDetail);
router.get("/get-referral-link", authenticateUser, getReferralLink);
router.get("/login-history", authenticateUser, loginHistory);
router.post("/address/address-verification", authenticateUser, upload.fields([{ name: "front_document", maxCount: 1 }, { name: "back_document", maxCount: 1 }]), addressVerification);
router.get("/address/get-address-verification", authenticateUser, getAddressVerification);
router.post("/address/id-verification", authenticateUser, upload.fields([{ name: "document_front_image", maxCount: 1 }, { name: "document_back_image", maxCount: 1 }]), storeAddress);
router.get("/address/get-id-verification-details", authenticateUser, getIdDetails);
router.post("/payment-details/add-payment-details", formData, authenticateUser, storePaymentDetails);
router.get("/payment-details/get-payment-details", authenticateUser, getPaymentDetails);
router.post("/payment-details/add-upi-details", authenticateUser, singelUpload.single("qr_code"), addUpiDetails);
router.get("/payment-details/get-upi-details", authenticateUser, getUpiDetails);
router.post("/update-username", formData, authenticateUser, validateUsername, updateUsername);
router.post("/change-password", formData, authenticateUser, validateChangePassword, changePassword);
router.post("/update-bio", formData, authenticateUser, validateBio, updateBio);
router.post("/security-questions", authenticateUser, securityQuestion);
router.get("/security-questions", authenticateUser, getSecurityQuestion);
router.post("/update-profile-image", uploadImage.single("image"), authenticateUser, updateProfileImage);
router.get("/crypto-advertisement/my-crypto-ad", authenticateUser, getMyCryptoAd);
router.post("/crypto-advertisement/create-crypto-ad",formData, authenticateUser, createCryptoAd);
router.get("/crypto-advertisement/crypto-ad", authenticateUser, getCryptoAd);




export default router;
