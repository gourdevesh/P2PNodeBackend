import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validationResult, body } from 'express-validator';
import * as UAParser from 'ua-parser-js'; // Fixed import
import { v4 as uuidv4 } from 'uuid'
import { RateLimiterMemory } from 'rate-limiter-flexible';
import prisma from '../../config/prismaClient.js';
import { convertBigIntToString } from '../../config/convertBigIntToString.js';
const limiter = new RateLimiterMemory({
  points: 5, // 5 attempts
  duration: 900, // 15 minutes
});

// Validation middleware
export const validateLogin = [
  body('email').isEmail().withMessage('Invalid email'),
  body('password').isLength({ min: 1 }).withMessage('Password is required'),
];


// Validation middleware
export const validateRegister = [
  body('email')
    .isEmail().withMessage('Invalid email')
    .custom(async (email) => {
      const existingUser = await prisma.users.findUnique({ where: { email } });
      if (existingUser) throw new Error('Email already in use');
      return true;
    }),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Must contain an uppercase letter')
    .matches(/[a-z]/).withMessage('Must contain a lowercase letter')
    .matches(/[0-9]/).withMessage('Must contain a number')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Must contain a special character'),
  body('referralCode').optional().isString(),
];



// Validation middleware for admin registration
export const validateAdminRegister = [
  body("name").notEmpty().withMessage("Name is required"),
  body("email")
    .isEmail()
    .withMessage("Invalid email")
    .custom(async (email) => {
      const existingAdmin = await prisma.admin.findUnique({ where: { email } });
      if (existingAdmin) throw new Error("Email already exists");
      return true;
    }),
  body("phone_number")
    .notEmpty()
    .withMessage("Phone number is required")
    .custom(async (phone_number) => {
      const existingAdmin = await prisma.admin.findFirst({ where: { phone_number } });
      if (existingAdmin) throw new Error("Phone number already exists");
      return true;
    }),
  body("password")
    .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
    .matches(/[A-Z]/).withMessage("Must contain an uppercase letter")
    .matches(/[a-z]/).withMessage("Must contain a lowercase letter")
    .matches(/[0-9]/).withMessage("Must contain a number")
    .matches(/[!@#$%^&*(),.?":{}|<>_]/).withMessage("Must contain a special character"),
  body("role")
    .isIn(["admin", "sub_admin"]).withMessage("Role must be admin or sub_admin")
    .custom((role) => {
      if (role === "super_admin") throw new Error("Super admin cannot be assigned");
      return true;
    }),
];

// Controller function
export const registerAdmin = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(422).json({ status: false, message: "Validation failed", errors: errors.array() });

    const { name, email, phone_number, password, role } = req.body;

    // Assume `req.admin` contains the logged-in admin
    const admin = req.admin;
    if (admin && admin.role !== "super_admin") {
      return res.status(403).json({
        status: false,
        message: "Unauthorized access. Only Super admin can create another admin or sub admin.",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin
    const newAdmin = await prisma.admins.create({
      data: {
        name,
        email,
        phone_number,
        password: hashedPassword,
        role,
      },
    });

    const roleLabel = role === "admin" ? "Admin" : "Sub Admin";

    return res.status(201).json({
      status: true,
      message: `${roleLabel} created successfully!`,
      admin: newAdmin,
    });

  } catch (err) {
    console.error("Admin registration failed:", err);
    return res.status(500).json({
      status: false,
      message: "Something went wrong",
      errors: err.message,
    });
  }
};
// Register controller
export const register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(422).json({ status: false, message: 'Validation failed', errors: errors.array() });

  const { email, password, referralCode } = req.body;

  try {
    // Settings check
    const settingData = await prisma.settings.findUnique({
      where: { setting_id: BigInt(1) }
    });
    if (!settingData) throw new Error('Setting data not found');
    if (settingData.user_registration === 'disable')
      return res.status(400).json({ status: false, message: 'User registration is temporarily disabled.' });

    // Generate username and referral
    const username = `user${Math.floor(Math.random() * 100000)}`;
    const myReferralCode = `REF${Math.floor(Math.random() * 100000)}`;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.users.create({
      data: {
        username,
        email,
        password: hashedPassword,
        my_referral_code: myReferralCode,
        referral_code: referralCode || null,
        user_level: 0,
        login_with: 'email',
        login_status: 'login',
        login_count: 1,
        last_login: new Date(),
        logged_in_device: req.headers['user-agent'] || null,
        loggedIn_device_ip: req.headers['x-forwarded-for'] || req.ip,
        created_at: new Date(),
      },
    });

    // Notification
    await prisma.notifications.create({
      data: {
        user_id: user.user_id,
        title: "Signed up successfully",
        message: "Welcome to OnnBit platform.",
        type: 'account_activity',
        is_read: false,
      },
    });

    // JWT token
    const token = jwt.sign({ userId: user.user_id.toString() }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });

    // Device info using UAParser
    const ua = new UAParser.UAParser(req.headers['user-agent'] || '');
    const deviceData = {
      clientInfo: req.headers['user-agent'] || '',
      device: ua.getDevice().model || ua.getDevice().type || null,
      os: ua.getOS().name || null,
      os_version: ua.getOS().version || null,
    };

    // Login details
    await prisma.user_login_details.create({
      data: {
        user_id: user.user_id,
        token_id: token, // store JWT here
        ip_address: req.headers['x-forwarded-for'] || req.ip,
        device_details: JSON.stringify(deviceData),
        device: deviceData.device,
        browser: deviceData.clientInfo,
        os: deviceData.os,
        os_version: deviceData.os_version,
        login_status: 'login',
        logged_in_at: new Date(),
      },
    });
    // Keep only last 10 login records
    const oldLogins = await prisma.user_login_details.findMany({
      where: { user_id: user.user_id },
      orderBy: { login_details_id: 'desc' },
      skip: 10,
    });
    if (oldLogins.length) {
      const idsToDelete = oldLogins.map(r => r.login_details_id);
      await prisma.user_login_details.deleteMany({ where: { login_details_id: { in: idsToDelete } } });
    }

    // Return response
    return res.status(201).json({
      status: true,
      message: 'User registered successfully',
      token,
      user: convertBigIntToString(user),
    });

  } catch (error) {
    console.error('User registration failed:', error);
    return res.status(500).json({ status: false, message: 'Failed to register user', errors: error.message });
  }
};
export const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ status: false, message: 'Validation failed', errors: errors.array() });
  }

  const { email, password } = req.body;
  const key = `${email}-${req.ip}`; // throttle key

  try {
    // Check rate limiting
    await limiter.consume(key);

    // Find user
    const user = await prisma.users.findUnique({ where: { email } });
    if (!user) throw new Error('Invalid credentials');

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new Error('Invalid credentials');

    // Create JWT token
    const token = jwt.sign({ userId: user.user_id.toString() }, process.env.JWT_SECRET || 'secret', {
      expiresIn: '1d',
    });

    // Return response
    return res.status(200).json({
      status: true,
      message: 'Login successful',
      token,
      user: {
        user_id: user.user_id.toString(),
        email: user.email,
        username: user.username,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid credentials') {
      // Consume failed attempt for rate limiting
      await limiter.consume(key).catch(() => { });
      return res.status(401).json({ status: false, message: err.message });
    }

    if (err instanceof Error && err.msBeforeNext) {
      // Rate limit exceeded
      const seconds = Math.ceil(err.msBeforeNext / 1000);
      return res.status(429).json({ status: false, message: `Too many attempts. Try again in ${seconds} seconds.` });
    }

    console.error(err);
    return res.status(500).json({ status: false, message: 'Login failed', errors: err.message });
  }
};

// Logout controller (optional for JWT, just for client-side)
export const logout = async (req, res) => {
  // For JWT, usually logout is handled client-side by deleting token
  return res.status(200).json({ status: true, message: 'Logged out successfully' });
};

export const loginAdmin = async (req, res) => {
  try {
    const { username, password } = req.body;

    // 1. Validation
    if (!username || !password) {
      return res.status(422).json({
        status: false,
        message: "Validation failed",
        errors: [
          !username ? { username: "Username is required" } : null,
          !password ? { password: "Password is required" } : null,
        ].filter(Boolean),
      });
    }

    // 2. Determine if username is email or phone
    let field;
    if (/^\S+@\S+\.\S+$/.test(username)) {
      field = "email";
    } else if (/^\d+$/.test(username)) {
      field = "phone_number";
    } else {
      return res.status(401).json({
        status: false,
        message: "Invalid Credential",
      });
    }

    // 3. Find admin
    const admin = await prisma.admins.findFirst({ where: { [field]: username } });
    if (!admin) {
      return res.status(401).json({
        status: false,
        message: `Invalid ${field}`,
      });
    }

    console.log("Admin found:", admin);
    // 4. Check password
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        status: false,
        message: "Invalid Password",
      });
    }

    // 5. Update admin login info safely
    const updatedAdmin = await prisma.admins.update({
      where: { admin_id: admin.admin_id }, // <-- use admin_id, not id
      data: {
        login_with: field,
        login_status: "login",
        login_count: (admin.login_count || 0) + 1,
        last_login: new Date(),
        logged_in_device: req.headers["user-agent"] || null,
        loggedIn_device_ip: req.ip,
      },
    });

    // 6. Generate JWT token
    const token = jwt.sign(
      { adminId: updatedAdmin.admin_id?.toString(), // ? ensures no error if undefined
 role: updatedAdmin.role }, // id ko string me convert karna safe
      process.env.JWT_SECRET || "secret",
      { expiresIn: "1d" }
    );

    // 7. Return success
    return res.status(200).json({
      status: true,
      message: "Login successfully",
      admin: {
      admin_id: updatedAdmin.admin_id?.toString(), // ? ensures no error if undefined
        name: updatedAdmin.name,
        email: updatedAdmin.email,
        phone_number: updatedAdmin.phone_number,
        role: updatedAdmin.role,
      },
      token,
    });

  } catch (err) {
    console.error("Admin login failed:", err);
    return res.status(500).json({
      status: false,
      message: "Something went wrong",
      errors: err.message,
    });
  }
};

export const logOut = async (req, res) => {
  const { admin_id } = req.admin;

  try {
    if (!admin_id) {
      return res.status(401).json({
        status: false,
        message: "Admin not authenticated",
      });
    }

    // 🔹 Start a Prisma transaction
    await prisma.$transaction(async (tx) => {
      // 1️⃣ Delete all active tokens for this admin
      await tx.tokens.deleteMany({
        where: { admin_id },
      });

      // 2️⃣ Update admin login status
      await tx.admin.update({
        where: { id: admin_id },
        data: { login_status: "logout" },
      });
    });

    return res.status(200).json({
      status: true,
      message: "Successfully logged out",
    });

  } catch (error) {
    console.error("Admin logout failed:", {
      error: error.message,
      ip_address: req.ip,
      device_information: req.headers["user-agent"],
      request_data: req.body,
    });

    return res.status(500).json({
      status: false,
      message: "Error occurred during logout",
      errors: error.message,
    });
  }
};