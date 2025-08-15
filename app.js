#!/usr/bin/env node

/**
 * BizzLeap cPanel Startup File
 * This file is the entry point for cPanel Node.js apps
 */

// Load environment variables
require("dotenv").config();

// Start the main server
require("./server.js");

console.log("🚀 BizzLeap API started successfully");
console.log("📊 Environment:", process.env.NODE_ENV || "production");
console.log("🔗 Port:", process.env.PORT || 3000);
