#!/usr/bin/env node

/**
 * BizzLeap Production Setup Script for cPanel
 * This script sets up the production environment for cPanel hosting
 */

const fs = require("fs-extra");
const path = require("path");
const mysql = require("mysql2/promise");

const setupProduction = async () => {
  console.log("🚀 Starting BizzLeap Production Setup for cPanel...\n");

  try {
    // 1. Check environment file
    console.log("1️⃣ Checking environment configuration...");
    const envPath = path.join(__dirname, "../.env");

    if (!(await fs.pathExists(envPath))) {
      console.log("   ⚠️ .env file not found. Copying from .env.example...");
      await fs.copy(path.join(__dirname, "../.env.example"), envPath);
      console.log(
        "   📝 Please update the .env file with your production settings",
      );
      console.log(
        "   🔑 Make sure to set: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET",
      );
      return;
    }
    console.log("   ✅ Environment file found");

    // 2. Load environment variables
    require("dotenv").config({ path: envPath });

    // 3. Create necessary directories
    console.log("\n2️⃣ Creating necessary directories...");
    const directories = ["../uploads", "../logs", "../backups", "../temp"];

    for (const dir of directories) {
      const dirPath = path.join(__dirname, dir);
      await fs.ensureDir(dirPath);
      console.log(`   📁 Created: ${dir}`);
    }

    // 4. Test database connection
    console.log("\n3️⃣ Testing database connection...");
    try {
      const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306,
      });

      await connection.ping();
      console.log("   ✅ Database connection successful");

      // 5. Setup database schema
      console.log("\n4️⃣ Setting up database schema...");
      const schemaPath = path.join(__dirname, "schema.sql");

      if (await fs.pathExists(schemaPath)) {
        const schema = await fs.readFile(schemaPath, "utf8");
        const statements = schema.split(";").filter((stmt) => stmt.trim());

        console.log(
          `   📊 Executing ${statements.length} database statements...`,
        );

        for (const statement of statements) {
          if (statement.trim()) {
            await connection.execute(statement);
          }
        }

        console.log("   ✅ Database schema setup complete");
      }

      await connection.end();
    } catch (dbError) {
      console.log("   ❌ Database connection failed:", dbError.message);
      console.log("   🔧 Please check your database credentials in .env file");
      return;
    }

    // 6. Create .htaccess for cPanel
    console.log("\n5️⃣ Creating cPanel configuration files...");
    await createHtaccess();
    await createNodejsConfig();

    // 7. Create deployment script
    console.log("\n6️⃣ Creating deployment helpers...");
    await createDeploymentScript();

    // 8. Set file permissions
    console.log("\n7️⃣ Setting file permissions...");
    await setFilePermissions();

    console.log("\n🎉 Production setup complete!");
    console.log("\n📋 Next steps:");
    console.log("   1. Upload all files to your cPanel public_html directory");
    console.log(
      "   2. Set up Node.js app in cPanel with entry point: server.js",
    );
    console.log("   3. Install dependencies: npm install");
    console.log("   4. Start the application through cPanel Node.js interface");
    console.log("   5. Test the API: https://bizzleap.lontain.com/api/health");
  } catch (error) {
    console.error("❌ Setup failed:", error.message);
    process.exit(1);
  }
};

const createHtaccess = async () => {
  const htaccessContent = `# BizzLeap API .htaccess for cPanel
RewriteEngine On

# Handle CORS preflight requests
RewriteCond %{REQUEST_METHOD} OPTIONS
RewriteRule ^(.*)$ $1 [R=200,L]

# Redirect API requests to Node.js app
RewriteCond %{REQUEST_URI} ^/api/
RewriteRule ^(.*)$ http://localhost:${process.env.PORT || 3000}/$1 [P,L]

# Security headers
<IfModule mod_headers.c>
    Header always set X-Content-Type-Options nosniff
    Header always set X-Frame-Options DENY
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
    
    # CORS headers
    Header always set Access-Control-Allow-Origin "*"
    Header always set Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
    Header always set Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With"
    Header always set Access-Control-Max-Age "86400"
</IfModule>

# Cache static files
<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType image/jpg "access plus 1 month"
    ExpiresByType image/jpeg "access plus 1 month"
    ExpiresByType image/gif "access plus 1 month"
    ExpiresByType image/png "access plus 1 month"
    ExpiresByType text/css "access plus 1 month"
    ExpiresByType application/pdf "access plus 1 month"
    ExpiresByType text/javascript "access plus 1 month"
    ExpiresByType application/javascript "access plus 1 month"
</IfModule>

# Deny access to sensitive files
<Files ".env">
    Order allow,deny
    Deny from all
</Files>

<Files "*.log">
    Order allow,deny
    Deny from all
</Files>
`;

  await fs.writeFile(path.join(__dirname, "../.htaccess"), htaccessContent);
  console.log("   📄 Created .htaccess file");
};

const createNodejsConfig = async () => {
  const startupFile = `#!/usr/bin/env node

/**
 * BizzLeap Production Startup File for cPanel
 */

// Load environment variables
require('dotenv').config();

// Start the server
require('./server.js');

console.log('🚀 BizzLeap API started successfully');
console.log('📊 Environment:', process.env.NODE_ENV);
console.log('🔗 Port:', process.env.PORT);
`;

  await fs.writeFile(path.join(__dirname, "../app.js"), startupFile);
  console.log("   📄 Created app.js startup file");

  // Create package.json start script specifically for cPanel
  const packageJsonPath = path.join(__dirname, "../package.json");
  const packageJson = await fs.readJson(packageJsonPath);

  packageJson.scripts = {
    ...packageJson.scripts,
    "cpanel-start": "node app.js",
    "cpanel-install": "npm install --production",
  };

  await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
  console.log("   📄 Updated package.json with cPanel scripts");
};

const createDeploymentScript = async () => {
  const deployScript = `#!/bin/bash

# BizzLeap cPanel Deployment Script
echo "🚀 Deploying BizzLeap to cPanel..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production

# Run database migrations
echo "🗄️ Setting up database..."
node scripts/production-setup.js

# Set permissions
echo "🔐 Setting file permissions..."
chmod 755 server.js
chmod 755 app.js
chmod -R 755 uploads/
chmod 600 .env

echo "✅ Deployment complete!"
echo "🌐 Your API should be available at: https://bizzleap.lontain.com/api/health"
`;

  await fs.writeFile(path.join(__dirname, "../deploy.sh"), deployScript);
  console.log("   📄 Created deployment script");
};

const setFilePermissions = async () => {
  try {
    // These would work on Unix-like systems
    // cPanel users should set these manually through File Manager
    console.log("   📋 File permissions should be set as follows:");
    console.log("      - .env: 600 (read/write owner only)");
    console.log("      - *.js files: 644 (read/write owner, read others)");
    console.log("      - uploads/: 755 (full owner, read/execute others)");
    console.log("      - logs/: 755 (full owner, read/execute others)");
  } catch (error) {
    console.log(
      "   ⚠️ Please set file permissions manually in cPanel File Manager",
    );
  }
};

// Run setup if called directly
if (require.main === module) {
  setupProduction();
}

module.exports = { setupProduction };
`;

  await fs.writeFile(path.join(__dirname, '../web.config'), webConfig);
  console.log('   📄 Created web.config for IIS (if needed)');
`;

// Run the setup
setupProduction().catch(console.error);
