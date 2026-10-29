
const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      status: "error",
      message: "Please log in to continue.",
    });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      status: "error",
      message: "Authentication is not configured.",
    });
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.sub) {
      return res.status(401).json({
        status: "error",
        message: "Invalid token.",
      });
    }

    req.userId = decoded.sub;
    req.userRole = decoded.role;

    next();
  } catch (error) {
    return res.status(401).json({
      status: "error",
      message: "Your session is invalid or expired. Please log in again.",
    });
  }
}

module.exports = authenticateToken;
