require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const cors = require("cors");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const path = require("path");

// Database
const { connectDB, getConnection } = require("./config/database");

const app = express();
const PORT = process.env.PORT || 10000;
const isProduction = process.env.NODE_ENV === "production";

// ===== Security & Middleware =====
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan(isProduction ? "combined" : "dev"));

// CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  })
);

// ✅ Log all incoming requests with origin and user agent
app.use((req, res, next) => {
  const origin = req.get("origin") || "N/A";
  const userAgent = req.get("user-agent") || "N/A";
  console.log(
    `📥 [${new Date().toISOString()}] ${req.method} ${req.originalUrl} | Origin: ${origin} | UA: ${userAgent}`
  );
  next();
});

// ===== Session Store (MySQL instead of MemoryStore) =====
const sessionStore = new MySQLStore(
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    createDatabaseTable: true,
    schema: {
      tableName: "app_sessions",
      columnNames: {
        session_id: "session_id",
        expires: "expires",
        data: "data",
      },
    },
  },
  getConnection()
);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "super-secret-key",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      secure: isProduction,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    },
  })
);

// ===== Routes =====
app.get("/", (req, res) => {
  res.send("✅ BizzLeap API server is running");
});

// ✅ Handle Render’s health check HEAD /
app.head("/", (req, res) => {
  res.status(200).end();
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", env: process.env.NODE_ENV || "development" });
});

// Example route
app.get("/api/example", async (req, res) => {
  try {
    const db = getConnection();
    const [rows] = await db.query("SELECT NOW() as now");
    res.json({ serverTime: rows[0].now });
  } catch (err) {
    console.error("❌ DB query failed:", err.message);
    res.status(500).json({ error: "Database query failed" });
  }
});

// ===== Start Server =====
(async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`🚀 BizzLeap Production Server running on port ${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`📊 Database: MySQL`);
      console.log(`🔒 Security: Enhanced for production`);
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err.message);
    process.exit(1);
  }
})();
