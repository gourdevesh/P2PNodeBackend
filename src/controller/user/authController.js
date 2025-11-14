import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import DeviceDetector from "node-device-detector";
import { validationResult } from "express-validator";
import { body } from "express-validator";
import moment from "moment";
import { convertBigIntToString } from "../../config/convertBigIntToString.js";
import { v4 as uuidv4 } from 'uuid';
import dayjs from "dayjs";

const prisma = new PrismaClient();
const detector = new DeviceDetector();

export const registerValidation = [
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email format"),
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .custom((value) => {
      if (!/[A-Z]/.test(value)) throw new Error("Password must contain an uppercase letter");
      if (!/[a-z]/.test(value)) throw new Error("Password must contain a lowercase letter");
      if (!/[0-9]/.test(value)) throw new Error("Password must contain a number");
      if (!/[!@#$%^&*(),.?\":{}|<>]/.test(value))
        throw new Error("Password must contain a special character");
      return true;
    }),
  body("referralCode").optional().isString(),
];

// Function to generate username and referral code
const generateUsernameAndReferralCode = async () => {
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  const username = `user${randomNum}`;
  const myReferralCode = `REF${randomNum}`;
  return { username, myReferralCode };
};

// Main Register Function
export const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        status: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { email, password, referralCode } = req.body;

    const settingData = await prisma.settings.findUnique({
      where: { setting_id: BigInt(1) },
    });

    if (!settingData) {
      return res.status(404).json({
        status: false,
        message: "Setting data not found.",
      });
    }

    if (settingData.user_registration === "disable") {
      return res.status(403).json({
        status: false,
        message: "User registration is temporarily disabled on this platform.",
      });
    }

    const existingUser = await prisma.users.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({
        status: false,
        message: "Email already exists.",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const { username, myReferralCode } = await generateUsernameAndReferralCode();
      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await tx.users.create({
        data: {
          name: null,
          username,
          email,
          password: hashedPassword,
          my_referral_code: myReferralCode,
          referral_code: referralCode || null,
          user_level: 0,
          login_with: "email",
          login_status: "login",
          login_count: 1,
          last_login: new Date(),
          user_status: "active",
          created_at: new Date(),

        },
      });

      await tx.notifications.create({
        data: {
          user_id: user.user_id,
          title: "Signed up successfully.",
          message: "Congratulations, You have just signed up. Welcome to our platform OnnBit.",
          type: "account_activity",
          is_read: false,
        },
      });

      const ipAddress =
        req.headers["x-forwarded-for"] ||
        req.headers["cf-connecting-ip"] ||
        req.headers["x-real-ip"] ||
        req.ip;

      const deviceInfo = detector.detect(req.headers["user-agent"] || "");
      const clientInfo = deviceInfo.client || {};
      const osInfo = deviceInfo.os || {};
      const deviceName = deviceInfo.device?.type || null;

      const token = jwt.sign(
        { userId: user.user_id.toString(), email: user.email },
        process.env.JWT_SECRET || "secret",
        { expiresIn: "1d" }
      );

      await tx.user_login_details.create({
        data: {
          user_id: user.user_id,
          token_id: uuidv4(), // ✅ Add this line
          ip_address: ipAddress,
          device_details: JSON.stringify({ clientInfo, osInfo, device: deviceName }),
          device: deviceName,
          browser: clientInfo.name || null,
          os: osInfo.name || null,
          os_version: osInfo.version || null,
          login_status: "login",
          logged_in_at: new Date(),
        },
      });

      return { user: convertBigIntToString(user), token };
    });
    const safeData = convertBigIntToString(result)

    return res.status(201).json({
      status: true,
      message: "User registered successfully",
      token: safeData.token,
      user: safeData.user,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: false,
      message: "Server error",
      errors: err.message,
    });
  }
};

export const login = async (req, res) => {
  const { username, password } = req.body;

  try {
    // ✅ Basic validation
    if (!username || !password) {
      return res.status(422).json({
        status: false,
        message: "Validation failed",
        errors: { username: "Username is required", password: "Password is required" },
      });
    }

    // ✅ Detect login field (email or phone)
    const field = username.includes("@") ? "email" : "phone_number";
    console.log(field)
    console.log(username)

    // ✅ Find user
    const user = await prisma.users.findFirst({
      where: { [field]: username },
    });
    console.log(user)

    if (!user) {
      return res.status(401).json({ status: false, message: "Invalid credentials" });
    }

    // ✅ Compare password
    console.log(password)

    const validPassword = await bcrypt.compare(password, user.password);
    console.log("validPassword", validPassword)
    if (!validPassword) {
      return res.status(401).json({ status: false, message: "Invalid credentials" });
    }

    // ✅ Check user status
    if (!["active", "block", "terminate"].includes(user.user_status)) {
      return res.status(403).json({
        status: false,
        message: "Invalid user status. Please contact support.",
      });
    }

    if (user.user_status === "block") {
      return res.status(403).json({ status: false, message: "User is blocked. Please contact support." });
    }

    if (user.user_status === "terminate") {
      return res.status(403).json({ status: false, message: "User account is terminated." });
    }

    // ✅ If active, process login details
    if (user.user_status === "active") {
      const ipAddress =
        req.headers["x-forwarded-for"] ||
        req.headers["cf-connecting-ip"] ||
        req.headers["x-real-ip"] ||
        req.ip;

      const deviceDetector = new DeviceDetector();
      const device = deviceDetector.parseOs(req.headers["user-agent"]);

      // ✅ Update user login details
      const updatedUser = await prisma.users.update({
        where: { user_id: BigInt(user.user_id) },
        data: {
          login_with: field === "email" ? "email" : "phone",
          login_status: "login",
          login_count: user.login_count + 1,
          last_login: new Date(),
          logged_in_device: req.headers["user-agent"],
          loggedIn_device_ip: ipAddress,
        },
      });

      // ✅ Generate JWT token

      const token = jwt.sign(
        {
          userId: user.user_id.toString(), email: user.email, email_verified_at: user.email_verified_at,
          address_verified_at: user.address_verified_at
        },
        process.env.JWT_SECRET || "secret",
        { expiresIn: "7d" }
      );


      // ✅ Store login details
      const deviceData = {
        clientInfo: device.client,
        osInfo: device.os,
        device: device.device?.type,
        brand: device.device?.brand,
        model: device.device?.model,
      };

      await prisma.user_login_details.create({
        data: {
          user_id: user.user_id,
          token_id: uuidv4(), // ✅ Added token_id
          ip_address: ipAddress,
          device_details: JSON.stringify(deviceData),
          device: deviceData.device || null,
          browser: deviceData.clientInfo?.name || null,
          os: deviceData.osInfo?.name || null,
          os_version: deviceData.osInfo?.version || null,
          login_status: "login",
          logged_in_at: new Date(),
        },
      });

      // ✅ Keep last 10 login records
      const allLogins = await prisma.user_login_details.findMany({
        where: { user_id: user.user_id },
        orderBy: { login_details_id: "desc" },
        skip: 9,
        take: 1,
      });

      if (allLogins.length > 0) {
        const cutoffId = allLogins[0].login_details_id;
        await prisma.user_login_details.deleteMany({
          where: {
            user_id: user.user_id,
            login_details_id: { lt: cutoffId },
          },
        });
      }

      // ✅ Two-factor authentication (2FA)
      if (user.two_factor_auth) {
        const otp = Math.floor(100000 + Math.random() * 900000);
        const existingOtp = await prisma.email_otps.findFirst({
          where: { user_id: user.user_id },
        });

        if (existingOtp) {
          await prisma.email_otps.update({
            where: { id: existingOtp.id },
            data: { otp, expires_at: dayjs().add(5, "minute").toDate() },
          });
        } else {
          await prisma.email_otps.create({
            data: {
              user_id: user.user_id,
              email: user.email,
              otp,
              expires_at: dayjs().add(5, "minute").toDate(),
            },
          });
        }

        // TODO: implement email sending here (e.g. using nodemailer)
        console.log(`Send 2FA email to ${user.email} with OTP: ${otp}`);
      }

      // ✅ Return success response
      return res.status(200).json({
        status: true,
        message: "Login successful",
        token,
        twoFactorAuth: !!user.two_factor_auth,
        emailVerified: !!user.email_verified_at,
      });
    }

    return res.status(403).json({
      status: false,
      message: "User status is invalid. Please contact support.",
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      status: false,
      message: "An error occurred. Please try again.",
      errors: error.message,
    });
  }
};