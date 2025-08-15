const express = require("express");
const { body, validationResult } = require("express-validator");
const {
  registerUser,
  loginUser,
  getUserProfile,
  refreshToken,
  logoutUser,
} = require("../controllers/authController");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// Validation middleware
const validateRegistration = [
  body("firstName")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("First name is required and must be less than 100 characters"),
  body("lastName")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Last name is required and must be less than 100 characters"),
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email address"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),
];

const validateLogin = [
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email address"),
  body("password").notEmpty().withMessage("Password is required"),
];

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: "Validation failed",
      details: errors.array().map((error) => ({
        field: error.path,
        message: error.msg,
      })),
    });
  }
  next();
};

// Public routes
router.post(
  "/register",
  validateRegistration,
  handleValidationErrors,
  registerUser,
);
router.post("/login", validateLogin, handleValidationErrors, loginUser);
router.post("/refresh", refreshToken);

// Protected routes (require authentication)
router.get("/profile", authenticateToken, getUserProfile);
router.post("/logout", authenticateToken, logoutUser);

// Health check for auth routes
router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Auth routes are working",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
