require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs-extra");
const { v4: uuidv4 } = require("uuid");
const session = require("express-session");
const passport = require("./config/oauth");

// Routes
const authRoutes = require("./routes/authRoutes");

// Database connection
const { connectDB, getConnection } = require("./config/database");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET =
  process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production";

// Environment check
const isProduction = process.env.NODE_ENV === "production";

// Connect to database
connectDB().catch((error) => {
  console.error("Failed to connect to database:", error);
  process.exit(1);
});

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }),
);

app.use(compression());

// CORS configuration for production
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      process.env.FRONTEND_URL,
      process.env.MOBILE_APP_URL,
      "http://localhost:3000",
      "http://localhost:8080",
      "http://localhost:8081",
      "https://localhost:3000",
      "https://localhost:8080",
      "https://localhost:8081",
    ].filter(Boolean);

    // In production, be more strict
    if (isProduction) {
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    } else {
      // In development, allow all origins
      callback(null, true);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

// Logging
if (isProduction) {
  app.use(morgan("combined"));
} else {
  app.use(morgan("dev"));
}

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 100 : 1000, // Stricter in production
  message: {
    error: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    error: "Too many authentication attempts, please try again later.",
  },
});

app.use(limiter);
app.use("/api/auth", authLimiter);

// Session configuration for OAuth
app.use(
  session({
    secret: process.env.SESSION_SECRET || JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }),
);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// File upload configuration
const uploadDir = path.join(__dirname, process.env.UPLOAD_DIR || "uploads");
fs.ensureDirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = uuidv4();
    const extension = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${extension}`);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 5, // Max 5 files
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
});

// Helper functions
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Check if token exists in database and is active
    const db = getConnection();
    const [sessions] = await db.execute(
      "SELECT * FROM user_sessions WHERE token = ? AND isActive = 1 AND expiresAt > NOW()",
      [token],
    );

    if (sessions.length === 0) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }

    // Update last used time
    await db.execute(
      "UPDATE user_sessions SET lastUsedAt = NOW() WHERE token = ?",
      [token],
    );

    req.user = decoded;
    req.sessionId = sessions[0].id;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Invalid token" });
  }
};

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: "Validation failed",
      details: errors.array(),
    });
  }
  next();
};

// Helper function to generate order number
const generateOrderNumber = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `BL${timestamp}${random}`.toUpperCase();
};

// Image processing helper
const processImage = async (inputPath, outputPath, options = {}) => {
  const { width = 800, height = 600, quality = 80 } = options;

  await sharp(inputPath)
    .resize(width, height, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality })
    .toFile(outputPath);

  // Delete original if different from output
  if (inputPath !== outputPath) {
    await fs.remove(inputPath);
  }
};

// Routes
app.use("/api/auth", authRoutes);

// Health check
app.get("/api/health", async (req, res) => {
  try {
    const db = getConnection();
    await db.execute("SELECT 1");

    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      database: "connected",
      version: "1.0.0",
    });
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      timestamp: new Date().toISOString(),
      error: "Database connection failed",
    });
  }
});

// Authentication Routes
app.post(
  "/api/auth/register",
  [
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 8 }),
    body("firstName").trim().isLength({ min: 1 }),
    body("lastName").trim().isLength({ min: 1 }),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      const db = getConnection();

      // Check if user already exists
      const [existingUsers] = await db.execute(
        "SELECT id FROM users WHERE email = ?",
        [email],
      );

      if (existingUsers.length > 0) {
        return res.status(400).json({ error: "User already exists" });
      }

      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Create user
      const [result] = await db.execute(
        "INSERT INTO users (email, password, firstName, lastName) VALUES (?, ?, ?, ?)",
        [email, hashedPassword, firstName, lastName],
      );

      const userId = result.insertId;

      // Generate JWT
      const token = jwt.sign({ userId, email }, JWT_SECRET, {
        expiresIn: "7d",
      });

      // Store session
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      await db.execute(
        "INSERT INTO user_sessions (userId, token, deviceInfo, ipAddress, userAgent, expiresAt) VALUES (?, ?, ?, ?, ?, ?)",
        [
          userId,
          token,
          req.body.deviceInfo || null,
          req.ip,
          req.get("User-Agent"),
          expiresAt,
        ],
      );

      // Get user data (without password)
      const [users] = await db.execute(
        "SELECT id, email, firstName, lastName, role, profileSetup, country, createdAt FROM users WHERE id = ?",
        [userId],
      );

      res.status(201).json({
        message: "User created successfully",
        user: users[0],
        token,
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

app.post(
  "/api/auth/login",
  [body("email").isEmail().normalizeEmail(), body("password").notEmpty()],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, password } = req.body;
      const db = getConnection();

      // Find user
      const [users] = await db.execute(
        "SELECT * FROM users WHERE email = ? AND isActive = 1",
        [email],
      );

      if (users.length === 0) {
        return res.status(400).json({ error: "Invalid credentials" });
      }

      const user = users[0];

      // Check password
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(400).json({ error: "Invalid credentials" });
      }

      // Update last login
      await db.execute("UPDATE users SET lastLogin = NOW() WHERE id = ?", [
        user.id,
      ]);

      // Generate JWT
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: "7d" },
      );

      // Store session
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      await db.execute(
        "INSERT INTO user_sessions (userId, token, deviceInfo, ipAddress, userAgent, expiresAt) VALUES (?, ?, ?, ?, ?, ?)",
        [
          user.id,
          token,
          req.body.deviceInfo || null,
          req.ip,
          req.get("User-Agent"),
          expiresAt,
        ],
      );

      // Remove password from response
      delete user.password;

      res.json({
        message: "Login successful",
        user,
        token,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// Logout route
app.post("/api/auth/logout", authenticateToken, async (req, res) => {
  try {
    const db = getConnection();
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    // Deactivate the session
    await db.execute("UPDATE user_sessions SET isActive = 0 WHERE token = ?", [
      token,
    ]);

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// OAuth Routes

// Google OAuth
app.get(
  "/api/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] }),
);

app.get(
  "/api/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  async (req, res) => {
    try {
      const user = req.user;

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: "7d" },
      );

      // Store session in database
      const db = getConnection();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.execute(
        "INSERT INTO user_sessions (userId, token, deviceInfo, ipAddress, userAgent, expiresAt) VALUES (?, ?, ?, ?, ?, ?)",
        [
          user.id,
          token,
          "OAuth Google",
          req.ip,
          req.get("User-Agent"),
          expiresAt,
        ],
      );

      // Redirect to frontend with token
      const redirectUrl = user.profileSetup
        ? `${process.env.FRONTEND_URL}/dashboard?token=${token}`
        : `${process.env.FRONTEND_URL}/role-selection?token=${token}`;

      res.redirect(redirectUrl);
    } catch (error) {
      console.error("Google OAuth callback error:", error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
    }
  },
);

// Facebook OAuth
app.get(
  "/api/auth/facebook",
  passport.authenticate("facebook", { scope: ["email"] }),
);

app.get(
  "/api/auth/facebook/callback",
  passport.authenticate("facebook", { failureRedirect: "/login" }),
  async (req, res) => {
    try {
      const user = req.user;

      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: "7d" },
      );

      const db = getConnection();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.execute(
        "INSERT INTO user_sessions (userId, token, deviceInfo, ipAddress, userAgent, expiresAt) VALUES (?, ?, ?, ?, ?, ?)",
        [
          user.id,
          token,
          "OAuth Facebook",
          req.ip,
          req.get("User-Agent"),
          expiresAt,
        ],
      );

      const redirectUrl = user.profileSetup
        ? `${process.env.FRONTEND_URL}/dashboard?token=${token}`
        : `${process.env.FRONTEND_URL}/role-selection?token=${token}`;

      res.redirect(redirectUrl);
    } catch (error) {
      console.error("Facebook OAuth callback error:", error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
    }
  },
);

// Twitter OAuth
app.get("/api/auth/twitter", passport.authenticate("twitter"));

app.get(
  "/api/auth/twitter/callback",
  passport.authenticate("twitter", { failureRedirect: "/login" }),
  async (req, res) => {
    try {
      const user = req.user;

      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: "7d" },
      );

      const db = getConnection();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.execute(
        "INSERT INTO user_sessions (userId, token, deviceInfo, ipAddress, userAgent, expiresAt) VALUES (?, ?, ?, ?, ?, ?)",
        [
          user.id,
          token,
          "OAuth Twitter",
          req.ip,
          req.get("User-Agent"),
          expiresAt,
        ],
      );

      const redirectUrl = user.profileSetup
        ? `${process.env.FRONTEND_URL}/dashboard?token=${token}`
        : `${process.env.FRONTEND_URL}/role-selection?token=${token}`;

      res.redirect(redirectUrl);
    } catch (error) {
      console.error("Twitter OAuth callback error:", error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
    }
  },
);

// GitHub OAuth
app.get(
  "/api/auth/github",
  passport.authenticate("github", { scope: ["user:email"] }),
);

app.get(
  "/api/auth/github/callback",
  passport.authenticate("github", { failureRedirect: "/login" }),
  async (req, res) => {
    try {
      const user = req.user;

      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: "7d" },
      );

      const db = getConnection();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.execute(
        "INSERT INTO user_sessions (userId, token, deviceInfo, ipAddress, userAgent, expiresAt) VALUES (?, ?, ?, ?, ?, ?)",
        [
          user.id,
          token,
          "OAuth GitHub",
          req.ip,
          req.get("User-Agent"),
          expiresAt,
        ],
      );

      const redirectUrl = user.profileSetup
        ? `${process.env.FRONTEND_URL}/dashboard?token=${token}`
        : `${process.env.FRONTEND_URL}/role-selection?token=${token}`;

      res.redirect(redirectUrl);
    } catch (error) {
      console.error("GitHub OAuth callback error:", error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
    }
  },
);

// User Profile Routes
app.get("/api/user/profile", authenticateToken, async (req, res) => {
  try {
    const db = getConnection();
    const [users] = await db.execute(
      "SELECT id, email, firstName, lastName, role, phone, bio, avatar, country, state, city, location, zipCode, profileSetup, farmName, farmSize, farmType, productsGrown, organicCertified, businessName, businessType, servicesOffered, yearsInBusiness, website, buyerType, interests, monthlyBudget, currency, createdAt, lastLogin FROM users WHERE id = ?",
      [req.user.userId],
    );

    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(users[0]);
  } catch (error) {
    console.error("Profile fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put(
  "/api/user/profile",
  authenticateToken,
  [
    body("firstName").optional().trim().isLength({ min: 1 }),
    body("lastName").optional().trim().isLength({ min: 1 }),
    body("role").optional().isIn(["farmer", "business", "buyer"]),
    body("country").optional().trim(),
    body("profileSetup").optional().isBoolean(),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const db = getConnection();
      const allowedUpdates = [
        "firstName",
        "lastName",
        "role",
        "phone",
        "bio",
        "country",
        "state",
        "city",
        "location",
        "zipCode",
        "profileSetup",
        "farmName",
        "farmSize",
        "farmType",
        "productsGrown",
        "organicCertified",
        "businessName",
        "businessType",
        "servicesOffered",
        "yearsInBusiness",
        "website",
        "buyerType",
        "interests",
        "monthlyBudget",
        "currency",
      ];

      const updates = {};
      Object.keys(req.body).forEach((key) => {
        if (allowedUpdates.includes(key)) {
          updates[key] = req.body[key];
        }
      });

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      // Build dynamic query
      const setClause = Object.keys(updates)
        .map((key) => `${key} = ?`)
        .join(", ");
      const values = [...Object.values(updates), req.user.userId];

      await db.execute(`UPDATE users SET ${setClause} WHERE id = ?`, values);

      // Get updated user data
      const [users] = await db.execute(
        "SELECT id, email, firstName, lastName, role, phone, bio, avatar, country, state, city, location, zipCode, profileSetup, farmName, farmSize, farmType, productsGrown, organicCertified, businessName, businessType, servicesOffered, yearsInBusiness, website, buyerType, interests, monthlyBudget, currency, createdAt, lastLogin FROM users WHERE id = ?",
        [req.user.userId],
      );

      res.json({
        message: "Profile updated successfully",
        user: users[0],
      });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// File Upload Routes
app.post(
  "/api/upload/avatar",
  authenticateToken,
  upload.single("avatar"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const db = getConnection();
      const originalPath = req.file.path;
      const filename = `avatar_${req.user.userId}_${Date.now()}.jpg`;
      const outputPath = path.join(uploadDir, filename);

      // Process image
      await processImage(originalPath, outputPath, {
        width: 300,
        height: 300,
        quality: 85,
      });

      const avatarUrl = `/uploads/${filename}`;

      // Update user avatar in database
      await db.execute("UPDATE users SET avatar = ? WHERE id = ?", [
        avatarUrl,
        req.user.userId,
      ]);

      res.json({
        message: "Avatar uploaded successfully",
        url: avatarUrl,
      });
    } catch (error) {
      console.error("Avatar upload error:", error);
      res.status(500).json({ error: "Failed to upload avatar" });
    }
  },
);

// Product Routes
app.get("/api/products", async (req, res) => {
  try {
    const db = getConnection();
    const {
      userId,
      categoryId,
      search,
      country,
      page = 1,
      limit = 20,
    } = req.query;

    let query = `
      SELECT p.*, u.firstName, u.lastName, u.farmName, c.name as categoryName
      FROM products p
      LEFT JOIN users u ON p.userId = u.id
      LEFT JOIN categories c ON p.categoryId = c.id
      WHERE p.status = 'active'
    `;

    const queryParams = [];

    if (userId) {
      query += " AND p.userId = ?";
      queryParams.push(userId);
    }

    if (categoryId) {
      query += " AND p.categoryId = ?";
      queryParams.push(categoryId);
    }

    if (country) {
      query += " AND u.country = ?";
      queryParams.push(country);
    }

    if (search) {
      query += " AND (p.name LIKE ? OR p.description LIKE ?)";
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    query += " ORDER BY p.createdAt DESC";

    // Add pagination
    const offset = (page - 1) * limit;
    query += " LIMIT ? OFFSET ?";
    queryParams.push(parseInt(limit), parseInt(offset));

    const [products] = await db.execute(query, queryParams);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM products p
      LEFT JOIN users u ON p.userId = u.id
      WHERE p.status = 'active'
    `;

    const countParams = [];

    if (userId) {
      countQuery += " AND p.userId = ?";
      countParams.push(userId);
    }

    if (categoryId) {
      countQuery += " AND p.categoryId = ?";
      countParams.push(categoryId);
    }

    if (country) {
      countQuery += " AND u.country = ?";
      countParams.push(country);
    }

    if (search) {
      countQuery += " AND (p.name LIKE ? OR p.description LIKE ?)";
      countParams.push(`%${search}%`, `%${search}%`);
    }

    const [countResult] = await db.execute(countQuery, countParams);
    const total = countResult[0].total;

    res.json({
      products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Products fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create product
app.post(
  "/api/products",
  authenticateToken,
  [
    body("name").trim().isLength({ min: 1 }),
    body("description").trim().isLength({ min: 1 }),
    body("price").isNumeric(),
    body("categoryId").optional().isInt(),
    body("quantity").optional().isInt(),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const db = getConnection();

      // Verify user is a farmer
      const [users] = await db.execute("SELECT role FROM users WHERE id = ?", [
        req.user.userId,
      ]);

      if (users.length === 0 || users[0].role !== "farmer") {
        return res
          .status(403)
          .json({ error: "Access denied. Farmer role required." });
      }

      const {
        name,
        description,
        price,
        categoryId,
        quantity = 1,
        unit = "piece",
        sku,
        weight,
        organic = false,
        harvestDate,
        expiryDate,
      } = req.body;

      const [result] = await db.execute(
        `INSERT INTO products (userId, categoryId, name, description, price, quantity, unit, sku, weight, organic, harvestDate, expiryDate, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [
          req.user.userId,
          categoryId || null,
          name,
          description,
          price,
          quantity,
          unit,
          sku || null,
          weight || null,
          organic,
          harvestDate || null,
          expiryDate || null,
        ],
      );

      // Get the created product
      const [products] = await db.execute(
        "SELECT * FROM products WHERE id = ?",
        [result.insertId],
      );

      res.status(201).json({
        message: "Product created successfully",
        product: products[0],
      });
    } catch (error) {
      console.error("Product creation error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// Service Routes (similar structure to products)
app.get("/api/services", async (req, res) => {
  try {
    const db = getConnection();
    const {
      userId,
      categoryId,
      search,
      country,
      page = 1,
      limit = 20,
    } = req.query;

    let query = `
      SELECT s.*, u.firstName, u.lastName, u.businessName, c.name as categoryName
      FROM services s
      LEFT JOIN users u ON s.userId = u.id
      LEFT JOIN categories c ON s.categoryId = c.id
      WHERE s.status = 'active'
    `;

    const queryParams = [];

    if (userId) {
      query += " AND s.userId = ?";
      queryParams.push(userId);
    }

    if (categoryId) {
      query += " AND s.categoryId = ?";
      queryParams.push(categoryId);
    }

    if (country) {
      query += " AND u.country = ?";
      queryParams.push(country);
    }

    if (search) {
      query += " AND (s.name LIKE ? OR s.description LIKE ?)";
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    query += " ORDER BY s.createdAt DESC";

    // Add pagination
    const offset = (page - 1) * limit;
    query += " LIMIT ? OFFSET ?";
    queryParams.push(parseInt(limit), parseInt(offset));

    const [services] = await db.execute(query, queryParams);

    res.json({ services });
  } catch (error) {
    console.error("Services fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create service
app.post(
  "/api/services",
  authenticateToken,
  [
    body("name").trim().isLength({ min: 1 }),
    body("description").trim().isLength({ min: 1 }),
    body("price").isNumeric(),
    body("categoryId").optional().isInt(),
    body("priceType")
      .optional()
      .isIn(["fixed", "hourly", "daily", "monthly", "custom"]),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const db = getConnection();

      // Verify user is a business
      const [users] = await db.execute("SELECT role FROM users WHERE id = ?", [
        req.user.userId,
      ]);

      if (users.length === 0 || users[0].role !== "business") {
        return res
          .status(403)
          .json({ error: "Access denied. Business role required." });
      }

      const {
        name,
        description,
        price,
        categoryId,
        priceType = "fixed",
        duration,
        serviceArea,
        location,
      } = req.body;

      const [result] = await db.execute(
        `INSERT INTO services (userId, categoryId, name, description, price, priceType, duration, serviceArea, location, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [
          req.user.userId,
          categoryId || null,
          name,
          description,
          price,
          priceType,
          duration || null,
          serviceArea || location || null,
          location || null,
        ],
      );

      // Get the created service
      const [services] = await db.execute(
        "SELECT * FROM services WHERE id = ?",
        [result.insertId],
      );

      res.status(201).json({
        message: "Service created successfully",
        service: services[0],
      });
    } catch (error) {
      console.error("Service creation error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// Order Routes
app.get("/api/orders", authenticateToken, async (req, res) => {
  try {
    const db = getConnection();
    const { status, type } = req.query;

    let query = `
      SELECT o.*,
             buyer.firstName as buyerFirstName, buyer.lastName as buyerLastName,
             seller.firstName as sellerFirstName, seller.lastName as sellerLastName,
             p.name as productName, s.name as serviceName
      FROM orders o
      LEFT JOIN users buyer ON o.buyerId = buyer.id
      LEFT JOIN users seller ON o.sellerId = seller.id
      LEFT JOIN products p ON o.productId = p.id
      LEFT JOIN services s ON o.serviceId = s.id
      WHERE (o.buyerId = ? OR o.sellerId = ?)
    `;

    const queryParams = [req.user.userId, req.user.userId];

    if (status) {
      query += " AND o.status = ?";
      queryParams.push(status);
    }

    if (type) {
      query += " AND o.type = ?";
      queryParams.push(type);
    }

    query += " ORDER BY o.createdAt DESC";

    const [orders] = await db.execute(query, queryParams);

    res.json({ orders });
  } catch (error) {
    console.error("Orders fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create order
app.post(
  "/api/orders",
  authenticateToken,
  [
    body("type").isIn(["product", "service"]),
    body("productId").optional().isInt(),
    body("serviceId").optional().isInt(),
    body("quantity").isInt({ min: 1 }),
    body("unitPrice").isNumeric(),
    body("totalAmount").isNumeric(),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const db = getConnection();
      const {
        type,
        productId,
        serviceId,
        quantity,
        unitPrice,
        totalAmount,
        deliveryAddress,
        notes,
      } = req.body;

      // Validate that either productId or serviceId is provided
      if (type === "product" && !productId) {
        return res
          .status(400)
          .json({ error: "Product ID required for product orders" });
      }

      if (type === "service" && !serviceId) {
        return res
          .status(400)
          .json({ error: "Service ID required for service orders" });
      }

      // Get seller ID
      let sellerId;
      if (type === "product") {
        const [products] = await db.execute(
          "SELECT userId FROM products WHERE id = ?",
          [productId],
        );
        if (products.length === 0) {
          return res.status(404).json({ error: "Product not found" });
        }
        sellerId = products[0].userId;
      } else {
        const [services] = await db.execute(
          "SELECT userId FROM services WHERE id = ?",
          [serviceId],
        );
        if (services.length === 0) {
          return res.status(404).json({ error: "Service not found" });
        }
        sellerId = services[0].userId;
      }

      // Generate order number
      const orderNumber = generateOrderNumber();

      const [result] = await db.execute(
        `INSERT INTO orders (orderNumber, buyerId, sellerId, type, productId, serviceId, quantity, unitPrice, totalAmount, deliveryAddress, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderNumber,
          req.user.userId,
          sellerId,
          type,
          productId || null,
          serviceId || null,
          quantity,
          unitPrice,
          totalAmount,
          deliveryAddress || null,
          notes || null,
        ],
      );

      // Get the created order
      const [orders] = await db.execute("SELECT * FROM orders WHERE id = ?", [
        result.insertId,
      ]);

      res.status(201).json({
        message: "Order created successfully",
        order: orders[0],
      });
    } catch (error) {
      console.error("Order creation error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// Update order status
app.put(
  "/api/orders/:id/status",
  authenticateToken,
  [
    body("status").isIn([
      "pending",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "completed",
      "cancelled",
    ]),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const db = getConnection();
      const { id } = req.params;
      const { status } = req.body;

      // Verify user is the seller for this order
      const [orders] = await db.execute(
        "SELECT * FROM orders WHERE id = ? AND sellerId = ?",
        [id, req.user.userId],
      );

      if (orders.length === 0) {
        return res
          .status(404)
          .json({ error: "Order not found or access denied" });
      }

      // Update status with appropriate timestamp
      let timestampField = "";
      switch (status) {
        case "confirmed":
          timestampField = ", confirmedAt = NOW()";
          break;
        case "shipped":
          timestampField = ", shippedAt = NOW()";
          break;
        case "delivered":
          timestampField = ", deliveredAt = NOW()";
          break;
        case "completed":
          timestampField = ", completedAt = NOW()";
          break;
        case "cancelled":
          timestampField = ", cancelledAt = NOW()";
          break;
      }

      await db.execute(
        `UPDATE orders SET status = ?${timestampField} WHERE id = ?`,
        [status, id],
      );

      res.json({ message: "Order status updated successfully" });
    } catch (error) {
      console.error("Order status update error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// Analytics Routes
app.get("/api/analytics/dashboard", authenticateToken, async (req, res) => {
  try {
    const db = getConnection();
    const userId = req.user.userId;

    // Get user role to determine what analytics to show
    const [users] = await db.execute("SELECT role FROM users WHERE id = ?", [
      userId,
    ]);
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userRole = users[0].role;

    if (userRole === "farmer" || userRole === "business") {
      // Analytics for sellers

      // Revenue analytics
      const [revenueData] = await db.execute(
        `
        SELECT
          DATE_FORMAT(createdAt, '%Y-%m') as month,
          SUM(totalAmount) as revenue,
          COUNT(*) as orders
        FROM orders
        WHERE sellerId = ? AND status IN ('delivered', 'completed')
        AND createdAt >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        GROUP BY DATE_FORMAT(createdAt, '%Y-%m')
        ORDER BY month DESC
        LIMIT 12
      `,
        [userId],
      );

      // Total revenue
      const [totalRevenue] = await db.execute(
        `
        SELECT
          COALESCE(SUM(totalAmount), 0) as total,
          COUNT(*) as totalOrders
        FROM orders
        WHERE sellerId = ? AND status IN ('delivered', 'completed')
      `,
        [userId],
      );

      // Product/Service performance
      const tableToQuery = userRole === "farmer" ? "products" : "services";
      const [topItems] = await db.execute(
        `
        SELECT
          ${tableToQuery === "products" ? "p.name" : "s.name"} as name,
          COUNT(o.id) as sales,
          SUM(o.totalAmount) as revenue
        FROM orders o
        ${
          tableToQuery === "products"
            ? "JOIN products p ON o.productId = p.id"
            : "JOIN services s ON o.serviceId = s.id"
        }
        WHERE o.sellerId = ? AND o.status IN ('delivered', 'completed')
        GROUP BY ${tableToQuery === "products" ? "o.productId" : "o.serviceId"}
        ORDER BY sales DESC
        LIMIT 5
      `,
        [userId],
      );

      // Recent orders
      const [recentOrders] = await db.execute(
        `
        SELECT
          o.*,
          u.firstName as buyerFirstName,
          u.lastName as buyerLastName,
          ${tableToQuery === "products" ? "p.name as itemName" : "s.name as itemName"}
        FROM orders o
        JOIN users u ON o.buyerId = u.id
        ${
          tableToQuery === "products"
            ? "LEFT JOIN products p ON o.productId = p.id"
            : "LEFT JOIN services s ON o.serviceId = s.id"
        }
        WHERE o.sellerId = ?
        ORDER BY o.createdAt DESC
        LIMIT 10
      `,
        [userId],
      );

      // Order status counts
      const [statusCounts] = await db.execute(
        `
        SELECT
          status,
          COUNT(*) as count
        FROM orders
        WHERE sellerId = ?
        GROUP BY status
      `,
        [userId],
      );

      res.json({
        revenue: {
          total: totalRevenue[0].total,
          monthlyData: revenueData.reverse(),
          totalOrders: totalRevenue[0].totalOrders,
        },
        topItems,
        recentOrders,
        statusCounts: statusCounts.reduce((acc, item) => {
          acc[item.status] = item.count;
          return acc;
        }, {}),
      });
    } else {
      // Analytics for buyers
      const [purchaseData] = await db.execute(
        `
        SELECT
          DATE_FORMAT(createdAt, '%Y-%m') as month,
          SUM(totalAmount) as spent,
          COUNT(*) as orders
        FROM orders
        WHERE buyerId = ? AND status IN ('delivered', 'completed')
        AND createdAt >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        GROUP BY DATE_FORMAT(createdAt, '%Y-%m')
        ORDER BY month DESC
        LIMIT 12
      `,
        [userId],
      );

      const [totalSpent] = await db.execute(
        `
        SELECT
          COALESCE(SUM(totalAmount), 0) as total,
          COUNT(*) as totalOrders
        FROM orders
        WHERE buyerId = ? AND status IN ('delivered', 'completed')
      `,
        [userId],
      );

      res.json({
        spending: {
          total: totalSpent[0].total,
          monthlyData: purchaseData.reverse(),
          totalOrders: totalSpent[0].totalOrders,
        },
      });
    }
  } catch (error) {
    console.error("Analytics fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Marketplace summary
app.get("/api/marketplace/summary", async (req, res) => {
  try {
    const db = getConnection();

    // Get product counts by category
    const [productStats] = await db.execute(`
      SELECT
        c.name as categoryName,
        COUNT(p.id) as productCount
      FROM categories c
      LEFT JOIN products p ON c.id = p.categoryId AND p.status = 'active'
      WHERE c.type IN ('product', 'both')
      GROUP BY c.id, c.name
      ORDER BY productCount DESC
    `);

    // Get service counts by category
    const [serviceStats] = await db.execute(`
      SELECT
        c.name as categoryName,
        COUNT(s.id) as serviceCount
      FROM categories c
      LEFT JOIN services s ON c.id = s.categoryId AND s.status = 'active'
      WHERE c.type IN ('service', 'both')
      GROUP BY c.id, c.name
      ORDER BY serviceCount DESC
    `);

    // Recent activity
    const [recentProducts] = await db.execute(`
      SELECT p.*, u.firstName, u.lastName, u.farmName
      FROM products p
      JOIN users u ON p.userId = u.id
      WHERE p.status = 'active'
      ORDER BY p.createdAt DESC
      LIMIT 5
    `);

    const [recentServices] = await db.execute(`
      SELECT s.*, u.firstName, u.lastName, u.businessName
      FROM services s
      JOIN users u ON s.userId = u.id
      WHERE s.status = 'active'
      ORDER BY s.createdAt DESC
      LIMIT 5
    `);

    res.json({
      productStats,
      serviceStats,
      recentProducts,
      recentServices,
    });
  } catch (error) {
    console.error("Marketplace summary error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Categories route
app.get("/api/categories", async (req, res) => {
  try {
    const db = getConnection();
    const { type } = req.query;

    let query = "SELECT * FROM categories WHERE isActive = 1";
    const queryParams = [];

    if (type) {
      query += ' AND (type = ? OR type = "both")';
      queryParams.push(type);
    }

    query += " ORDER BY sortOrder, name";

    const [categories] = await db.execute(query, queryParams);

    res.json({ categories });
  } catch (error) {
    console.error("Categories fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Serve uploaded files
app.use(
  "/uploads",
  express.static(uploadDir, {
    maxAge: "1d",
    setHeaders: (res, path) => {
      if (
        path.endsWith(".jpg") ||
        path.endsWith(".jpeg") ||
        path.endsWith(".png")
      ) {
        res.setHeader("Cache-Control", "public, max-age=86400"); // 1 day
      }
    },
  }),
);

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ error: "File too large. Maximum size is 5MB." });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res
        .status(400)
        .json({ error: "Too many files. Maximum is 5 files." });
    }
  }

  res.status(500).json({
    error: isProduction ? "Internal server error" : error.message,
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
  });
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  server.close(() => {
    console.log("HTTP server closed.");

    // Close database connection
    const { closeConnection } = require("./config/database");
    closeConnection().then(() => {
      console.log("Database connection closed.");
      process.exit(0);
    });
  });
};

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 BizzLeap Production Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`📊 Database: MySQL`);
  console.log(`🔒 Security: Enhanced for production`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);

  if (!isProduction) {
    console.log(`\n📚 API Documentation:`);
    console.log(`   Health: GET /api/health`);
    console.log(`   Auth: POST /api/auth/login, /api/auth/register`);
    console.log(`   Users: GET/PUT /api/user/profile`);
    console.log(`   Products: GET/POST /api/products`);
    console.log(`   Services: GET/POST /api/services`);
    console.log(`   Orders: GET/POST /api/orders`);
    console.log(`   Categories: GET /api/categories`);
  }
});

// Handle shutdown signals
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

module.exports = app;
