const jwt = require("jsonwebtoken");
const { getConnection } = require("../config/database");

const JWT_SECRET = process.env.JWT_SECRET || "your-fallback-secret";

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: "Access denied",
        message: "No token provided",
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    const db = getConnection();

    // Check if user exists in database
    const [users] = await db.execute(
      `SELECT id FROM users WHERE id = ?`,
      [userId],
    );

    if (users.length === 0) {
      return res.status(401).json({
        error: "Invalid token",
        message: "User not found",
      });
    }

    // Add user info to request
    req.user = {
      userId: userId,
      token: token,
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        error: "Invalid token",
        message: "Token is malformed",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Token expired",
        message: "Please login again",
      });
    }

    return res.status(500).json({
      error: "Internal server error",
      message: "Authentication failed",
    });
  }
};

// Optional auth middleware (doesn't require token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = { userId: decoded.userId, token };
    }

    next();
  } catch (error) {
    // For optional auth, continue without user info if token is invalid
    next();
  }
};

module.exports = {
  authenticateToken,
  optionalAuth,
};
