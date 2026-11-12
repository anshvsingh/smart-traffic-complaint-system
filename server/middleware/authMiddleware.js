
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured");

      return res.status(500).json({
        status: "error",
        message: "Authentication is not configured",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.sub)
      .select("_id name email role department");

    if (!user) {
      return res.status(401).json({
        status: "error",
        message: "Invalid or expired authentication",
      });
    }

    req.user = user;
    next();

  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return res.status(401).json({
        status: "error",
        message: "Invalid or expired authentication",
      });
    }

    console.error("Authentication error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to authenticate request",
    });
  }
};

// Admin-only access
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      status: "error",
      message: "Administrator access required",
    });
  }

  next();
};

// Department-only access
const requireDepartment = (req, res, next) => {
  if (!req.user || req.user.role !== "department") {
    return res.status(403).json({
      status: "error",
      message: "Department access required",
    });
  }

  next();
};

module.exports = {
  protect,
  requireAdmin,
  requireDepartment,
};

