#!/usr/bin/env node

/**
 * OAuth Testing Script for BizzLeap
 * Tests OAuth endpoints and configuration
 */

const axios = require("axios");
const mysql = require("mysql2/promise");
require("dotenv").config();

const BASE_URL =
  process.env.NODE_ENV === "production"
    ? process.env.FRONTEND_URL
    : "http://localhost:3000";

// Colors for console output
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  header: (msg) =>
    console.log(`\n${colors.bold}${colors.blue}${msg}${colors.reset}`),
};

async function testEnvironmentVariables() {
  log.header("🔍 Testing Environment Variables");

  const requiredVars = [
    "JWT_SECRET",
    "SESSION_SECRET",
    "DB_HOST",
    "DB_USER",
    "DB_PASSWORD",
    "DB_NAME",
  ];

  const oauthVars = [
    "***REMOVED***",
    "***REMOVED***",
    "***REMOVED***",
    "***REMOVED***",
    "***REMOVED***",
    "***REMOVED***",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
  ];

  let allPresent = true;

  // Check required variables
  for (const varName of requiredVars) {
    if (process.env[varName]) {
      log.success(`${varName} is set`);
    } else {
      log.error(`${varName} is missing`);
      allPresent = false;
    }
  }

  // Check OAuth variables
  let oauthCount = 0;
  for (const varName of oauthVars) {
    if (process.env[varName]) {
      log.success(`${varName} is set`);
      oauthCount++;
    } else {
      log.warning(`${varName} is missing`);
    }
  }

  if (oauthCount === 0) {
    log.error("No OAuth providers configured");
    allPresent = false;
  } else {
    log.info(`${oauthCount / 2} OAuth providers configured`);
  }

  return allPresent;
}

async function testDatabaseConnection() {
  log.header("🗄️ Testing Database Connection");

  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    log.success("Database connection successful");

    // Test if social auth fields exist
    try {
      const [rows] = await connection.execute("DESCRIBE users");

      const columns = rows.map((row) => row.Field);

      if (columns.includes("socialId") && columns.includes("socialProvider")) {
        log.success("Social authentication fields exist in users table");
      } else {
        log.error("Social authentication fields missing in users table");
        log.info("Run this SQL to add them:");
        console.log(`
ALTER TABLE users 
ADD COLUMN socialId VARCHAR(255) DEFAULT NULL,
ADD COLUMN socialProvider ENUM('google', 'facebook', 'twitter', 'github') DEFAULT NULL,
ADD INDEX idx_social (socialId, socialProvider),
ADD UNIQUE KEY unique_social (socialId, socialProvider);
        `);
      }
    } catch (error) {
      log.error(`Error checking users table: ${error.message}`);
    }

    await connection.end();
    return true;
  } catch (error) {
    log.error(`Database connection failed: ${error.message}`);
    return false;
  }
}

async function testOAuthEndpoints() {
  log.header("🔗 Testing OAuth Endpoints");

  const providers = [
    {
      name: "Google",
      path: "google",
      envVars: ["***REMOVED***", "***REMOVED***"],
    },
    {
      name: "Facebook",
      path: "facebook",
      envVars: ["***REMOVED***", "***REMOVED***"],
    },
    {
      name: "Twitter",
      path: "twitter",
      envVars: ["***REMOVED***", "***REMOVED***"],
    },
    {
      name: "GitHub",
      path: "github",
      envVars: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
    },
  ];

  let workingProviders = 0;

  for (const provider of providers) {
    // Check if environment variables are set
    const hasCredentials = provider.envVars.every(
      (varName) => process.env[varName],
    );

    if (!hasCredentials) {
      log.warning(`${provider.name} OAuth credentials not configured`);
      continue;
    }

    try {
      const response = await axios.get(
        `${BASE_URL}/api/auth/${provider.path}`,
        {
          maxRedirects: 0,
          validateStatus: (status) => status >= 200 && status < 400,
        },
      );

      log.success(`${provider.name} OAuth endpoint responding`);
      workingProviders++;
    } catch (error) {
      if (error.response && error.response.status === 302) {
        log.success(`${provider.name} OAuth redirect working`);
        workingProviders++;
      } else if (error.code === "ECONNREFUSED") {
        log.error(`${provider.name} OAuth endpoint - Server not running`);
      } else {
        log.error(`${provider.name} OAuth endpoint failed: ${error.message}`);
      }
    }
  }

  log.info(`${workingProviders} OAuth providers working`);
  return workingProviders > 0;
}

async function testAPIEndpoints() {
  log.header("🌐 Testing API Endpoints");

  const endpoints = [
    { path: "/api/health", method: "GET", description: "Health check" },
    {
      path: "/api/auth/register",
      method: "POST",
      description: "User registration",
    },
    { path: "/api/auth/login", method: "POST", description: "User login" },
  ];

  let workingEndpoints = 0;

  for (const endpoint of endpoints) {
    try {
      const response = await axios({
        method: endpoint.method,
        url: `${BASE_URL}${endpoint.path}`,
        timeout: 5000,
        validateStatus: (status) => status < 500, // Accept 4xx as "working" endpoints
      });

      log.success(
        `${endpoint.description} endpoint responding (${response.status})`,
      );
      workingEndpoints++;
    } catch (error) {
      if (error.code === "ECONNREFUSED") {
        log.error(`${endpoint.description} endpoint - Server not running`);
      } else if (error.response && error.response.status < 500) {
        log.success(
          `${endpoint.description} endpoint responding (${error.response.status})`,
        );
        workingEndpoints++;
      } else {
        log.error(`${endpoint.description} endpoint failed: ${error.message}`);
      }
    }
  }

  return workingEndpoints > 0;
}

async function generateTestReport() {
  log.header("📊 OAuth Implementation Test Report");

  const envTest = await testEnvironmentVariables();
  const dbTest = await testDatabaseConnection();
  const oauthTest = await testOAuthEndpoints();
  const apiTest = await testAPIEndpoints();

  log.header("📋 Summary");

  const testResults = [
    { name: "Environment Variables", passed: envTest },
    { name: "Database Connection", passed: dbTest },
    { name: "OAuth Endpoints", passed: oauthTest },
    { name: "API Endpoints", passed: apiTest },
  ];

  testResults.forEach((test) => {
    if (test.passed) {
      log.success(`${test.name}: PASSED`);
    } else {
      log.error(`${test.name}: FAILED`);
    }
  });

  const allPassed = testResults.every((test) => test.passed);

  if (allPassed) {
    log.success(
      "\n🎉 All tests passed! OAuth implementation is ready for use.",
    );
  } else {
    log.error(
      "\n⚠️  Some tests failed. Please fix the issues above before proceeding.",
    );
  }

  // Provide next steps
  log.header("📝 Next Steps");

  if (allPassed) {
    console.log(`
${colors.green}✅ Your OAuth implementation is ready!${colors.reset}

To test OAuth flows manually:
1. Start your frontend: ${colors.blue}npm run dev${colors.reset}
2. Visit: ${colors.blue}${BASE_URL}/login${colors.reset}
3. Click on each social login button to test OAuth flows

Production deployment:
1. Update OAuth provider callback URLs to your production domain
2. Set environment variables on your production server
3. Run this test script on production to verify setup
    `);
  } else {
    console.log(`
${colors.yellow}⚠️  Please fix the failed tests above.${colors.reset}

Common solutions:
- Copy .env.example to .env and fill in your OAuth credentials
- Ensure your server is running: ${colors.blue}npm start${colors.reset}
- Run database migration to add social auth fields
- Check OAuth provider credentials and callback URLs
    `);
  }
}

// Run all tests
async function main() {
  console.log(`${colors.bold}${colors.blue}
╔═════════════════════════════════════════���════╗
║            BizzLeap OAuth Test Suite         ║
║              Testing OAuth Setup             ║
╚══════════════════════════════════════════════╝
${colors.reset}`);

  try {
    await generateTestReport();
  } catch (error) {
    log.error(`Test suite failed: ${error.message}`);
    process.exit(1);
  }
}

// Handle command line execution
if (require.main === module) {
  main();
}

module.exports = {
  testEnvironmentVariables,
  testDatabaseConnection,
  testOAuthEndpoints,
  testAPIEndpoints,
};
