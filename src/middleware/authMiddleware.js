// authMiddleware.js
import jwt from "jsonwebtoken";

export const authenticateAdmin = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ status: false, message: "No token provided" });
    }

    const token = authHeader.split(" ")[1]; // Bearer <token>
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");

    // Validate payload
    if (!decoded.adminId || !decoded.role) {
      return res.status(401).json({
        status: false,
        message: "Invalid token payload",
      });
    }

    // Set admin info on request
    req.admin = {
      admin_id: decoded.adminId,
      role: decoded.role,
      token:token
    };

    next();
  } catch (err) {
    return res.status(401).json({
      status: false,
      message: "Unauthorized",
      errors: err.message,
    });
  }
};

export const authenticateUser = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader)
      return res.status(401).json({ status: false, message: "No token provided" });

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");

    // Validate token payload
    if (!decoded.userId || isNaN(Number(decoded.userId)) || !decoded.email) {
      return res.status(401).json({
        status: false,
        message: "Invalid token payload",
      });
    }

    req.user = {
      user_id: Number(decoded.userId),
      email: decoded.email,
      email_verified_at: decoded.email_verified_at || null,
    };
    req.tokenId = decoded.tokenId || null;
    next();
  } catch (err) {
    return res.status(401).json({ status: false, message: "Invalid token" });
  }
};

