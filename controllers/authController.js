const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { getConnection } = require("../config/database");

const JWT_SECRET = process.env.JWT_SECRET || "your-fallback-secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

// Register user
const registerUser = async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        error: "All fields are required",
        details: "firstName, lastName, email, and password are required",
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: "Invalid email format",
      });
    }

    // Password validation
    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters long",
      });
    }

    const db = getConnection();

    // Check if user already exists
    const [existingUsers] = await db.execute(
      "SELECT id FROM users WHERE email = ?",
      [email.toLowerCase()],
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        error: "User already exists",
        message: "An account with this email address already exists",
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user with exact MySQL schema: id, email, password, firstName, lastName, role
    const [result] = await db.execute(
      `INSERT INTO users (email, password, firstName, lastName, role)
       VALUES (?, ?, ?, ?, ?)`,
      [
        email.toLowerCase(),
        hashedPassword,
        firstName.trim(),
        lastName.trim(),
        null, // role will be set during profile setup
      ],
    );

    const userId = result.insertId;

    // Generate JWT token
    const token = generateToken(userId);

    // Get created user (without password)
    const [newUser] = await db.execute(
      `SELECT id, firstName, lastName, email, role
       FROM users WHERE id = ?`,
      [userId],
    );

    const user = newUser[0];

    // Note: For simplicity, we're not storing sessions in database
    // In production, you might want to add a user_sessions table

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user: { ...user, profileSetup: false },
        token,
        redirectTo: "/role-selection",
      },
    });
  } catch (error) {
    console.error("Registration error:", error);

    // Handle specific MySQL errors
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: "User already exists",
        message: "An account with this email address already exists",
      });
    }

    res.status(500).json({
      error: "Internal server error",
      message: "Registration failed. Please try again.",
    });
  }
};

// Login user
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    const db = getConnection();

    // Find user by email
    const [users] = await db.execute(
      `SELECT id, firstName, lastName, email, password, role
       FROM users WHERE email = ?`,
      [email.toLowerCase()],
    );

    if (users.length === 0) {
      return res.status(401).json({
        error: "Invalid credentials",
        message: "Email or password is incorrect",
      });
    }

    const user = users[0];

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: "Invalid credentials",
        message: "Email or password is incorrect",
      });
    }

    // Generate JWT token
    const token = generateToken(user.id);

    // Remove password from response
    delete user.password;

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: { ...user, profileSetup: user.role ? true : false },
        token,
        redirectTo: user.role ? "/dashboard" : "/role-selection",
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: "Login failed. Please try again.",
    });
  }
};

// Get user profile
const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.userId; // Set by auth middleware
    const db = getConnection();

    const [users] = await db.execute(
      `SELECT id, firstName, lastName, email, role, phone, bio, avatar,
       country, state, city, location, zipCode, profileSetup,
       farmName, farmSize, farmType, productsGrown, organicCertified,
       businessName, businessType, servicesOffered, yearsInBusiness, website,
       buyerType, interests, monthlyBudget, currency, emailVerified,
       createdAt, lastLogin
       FROM users WHERE id = ? AND isActive = 1`,
      [userId],
    );

    if (users.length === 0) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: users[0],
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

// Refresh token
const refreshToken = async (req, res) => {
  try {
    const { authorization } = req.headers;
    if (!authorization || !authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "No token provided",
      });
    }

    const token = authorization.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    const db = getConnection();

    // Check if user exists
    const [users] = await db.execute(
      "SELECT id FROM users WHERE id = ? AND isActive = 1",
      [userId],
    );

    if (users.length === 0) {
      return res.status(401).json({
        error: "Invalid token",
      });
    }

    // Generate new token
    const newToken = generateToken(userId);

    // Update session
    await db.execute(
      "UPDATE user_sessions SET token = ?, lastUsedAt = NOW() WHERE userId = ? AND isActive = 1",
      [newToken, userId],
    );

    res.status(200).json({
      success: true,
      data: {
        token: newToken,
      },
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(401).json({
      error: "Invalid or expired token",
    });
  }
};

// Logout user
const logoutUser = async (req, res) => {
  try {
    const { authorization } = req.headers;
    if (authorization && authorization.startsWith("Bearer ")) {
      const token = authorization.split(" ")[1];
      const db = getConnection();

      // Deactivate session
      await db.execute(
        "UPDATE user_sessions SET isActive = 0 WHERE token = ?",
        [token],
      );
    }

    res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  refreshToken,
  logoutUser,
};
