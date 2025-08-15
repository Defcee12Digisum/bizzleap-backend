const mysql = require("mysql2/promise");
const fs = require("fs-extra");
const path = require("path");

// Database connection configuration
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "lontainc_def",
  password: process.env.DB_PASSWORD || "***REMOVED***",
  database: process.env.DB_NAME || "lontainc_bizzleap",
  port: process.env.DB_PORT || 3306,
  connectionLimit: 10,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true,
  charset: "utf8mb4",
  ssl:
    process.env.DB_SSL === "true"
      ? {
          rejectUnauthorized: false,
        }
      : false,
};

// Create connection pool
let pool;

const createPool = () => {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
    console.log("✅ MySQL connection pool created");
  }
  return pool;
};

const connectDB = async () => {
  try {
    const connection = createPool();

    // Test the connection
    const testConnection = await connection.getConnection();
    await testConnection.ping();
    testConnection.release();

    console.log(
      `✅ MySQL Connected: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`,
    );

    // Create tables if they don't exist
    await createTables();

    return connection;
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);

    // If database doesn't exist, try to create it
    if (error.code === "ER_BAD_DB_ERROR") {
      try {
        await createDatabase();
        return await connectDB();
      } catch (createError) {
        console.error("❌ Failed to create database:", createError.message);
        throw createError;
      }
    }

    throw error;
  }
};

const createDatabase = async () => {
  const tempConfig = { ...dbConfig };
  delete tempConfig.database;

  const connection = await mysql.createConnection(tempConfig);
  await connection.execute(
    `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await connection.end();

  console.log(`✅ Database '${dbConfig.database}' created successfully`);
};

const createTables = async () => {
  const connection = createPool();

  // Read and execute SQL schema
  const schemaPath = path.join(__dirname, "../scripts/schema.sql");

  if (await fs.pathExists(schemaPath)) {
    const schema = await fs.readFile(schemaPath, "utf8");
    const statements = schema.split(";").filter((stmt) => stmt.trim());

    for (const statement of statements) {
      if (statement.trim()) {
        await connection.execute(statement);
      }
    }

    console.log("✅ Database tables created/updated successfully");
  }
};

const getConnection = () => {
  if (!pool) {
    createPool();
  }
  return pool;
};

const closeConnection = async () => {
  if (pool) {
    await pool.end();
    pool = null;
    console.log("🔌 MySQL connection pool closed");
  }
};

// Handle app termination
process.on("SIGINT", async () => {
  await closeConnection();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeConnection();
  process.exit(0);
});

module.exports = {
  connectDB,
  getConnection,
  closeConnection,
  createDatabase,
  createTables,
};
