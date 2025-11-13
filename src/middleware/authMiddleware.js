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

    req.admin = {
      admin_id: decoded.adminId,
      role: decoded.role,
    };

    next();
  } catch (err) {
    return res.status(401).json({ status: false, message: "Unauthorized", errors: err.message });
  }
};
export const authenticateUser = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader)
      return res.status(401).json({ status: false, message: "No token provided" });

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");

    req.user = { user_id: Number(decoded.userId), email: decoded.email };
    req.tokenId = decoded.tokenId || null; // optional if you include it in your token payload
    next();
  } catch (err) {
    return res.status(401).json({ status: false, message: "Invalid token" });
  }
};
