# BizzLeap cPanel Production Deployment Guide

## 🎯 Overview

This guide will help you deploy the BizzLeap application to a cPanel hosting environment with MySQL database.

## 📋 Prerequisites

- cPanel hosting account with Node.js support
- MySQL database access
- SSH access (optional but recommended)
- Domain name configured

## 🚀 Step-by-Step Deployment

### 1. Prepare Your cPanel Environment

#### Create MySQL Database

1. Log into cPanel
2. Go to **MySQL Databases**
3. Create a new database: `yourusername_bizzleap`
4. Create a database user with full privileges
5. Note down the credentials:
   - Host: `localhost`
   - Database: `yourusername_bizzleap`
   - Username: `yourusername_dbuser`
   - Password: `your_secure_password`

#### Enable Node.js

1. Go to **Node.js Selector** in cPanel
2. Create a new Node.js app:
   - Node.js version: 16.x or higher
   - App root: `public_html/api` (or your preferred path)
   - App URL: `bizzleap.lontain.com/api`
   - Startup file: `app.js`

### 2. Upload Application Files

#### Option A: Using File Manager

1. Go to **File Manager** in cPanel
2. Navigate to your app root directory (`public_html/api`)
3. Upload all files from the `backend-cpanel` folder
4. Extract if uploaded as ZIP

#### Option B: Using FTP/SFTP

```bash
# Upload all files to your app root directory
scp -r backend-cpanel/* username@bizzleap.lontain.com:public_html/api/
```

### 3. Configure Environment

1. Copy `.env.example` to `.env`
2. Edit `.env` with your production settings:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=yourusername_dbuser
DB_PASSWORD=your_secure_password
DB_NAME=yourusername_bizzleap

# Production URLs
FRONTEND_URL=https://bizzleap.lontain.com
PORT=3000

# Security
JWT_SECRET=your-super-secure-jwt-secret-at-least-32-characters-long
NODE_ENV=production
```

### 4. Install Dependencies and Setup

#### Using cPanel Terminal (Recommended)

```bash
# Navigate to your app directory
cd public_html/api

# Install dependencies
npm install

# Run production setup
node scripts/production-setup.js
```

#### Using Node.js App Interface

1. Go to **Node.js Selector**
2. Click **NPM Install** for your app
3. Run the setup script through the terminal

### 5. Configure Web Server

#### Update .htaccess (if using Apache)

The production setup script creates an `.htaccess` file automatically. If you need to customize it:

```apache
RewriteEngine On

# Redirect API requests to Node.js app
RewriteCond %{REQUEST_URI} ^/api/
RewriteRule ^(.*)$ http://localhost:3000/$1 [P,L]

# CORS headers
Header always set Access-Control-Allow-Origin "*"
Header always set Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
Header always set Access-Control-Allow-Headers "Content-Type, Authorization"
```

### 6. Start the Application

1. Go to **Node.js Selector** in cPanel
2. Click **Start** for your app
3. Verify it's running in the **Status** column

### 7. Test the Deployment

Visit these URLs to test your deployment:

- **Health Check**: `https://bizzleap.lontain.com/api/health`
- **API Documentation**: `https://bizzleap.lontain.com/api/`

Expected response from health check:

```json
{
  "status": "OK",
  "timestamp": "2024-07-04T12:00:00.000Z",
  "environment": "production",
  "database": "connected",
  "version": "1.0.0"
}
```

## 🔧 Configuration Options

### Environment Variables

| Variable       | Description        | Example                  |
| -------------- | ------------------ | ------------------------ |
| `DB_HOST`      | MySQL host         | `localhost`              |
| `DB_USER`      | Database username  | `username_bizzleap`      |
| `DB_PASSWORD`  | Database password  | `secure_password123`     |
| `DB_NAME`      | Database name      | `username_bizzleap`      |
| `JWT_SECRET`   | JWT signing secret | `your-32-char-secret`    |
| `FRONTEND_URL` | Frontend domain    | `https://bizzleap.lontain.com` |
| `PORT`         | Application port   | `3000`                   |

### File Structure After Deployment

```
public_html/api/
├── server.js              # Main server file
├── app.js                 # cPanel startup file
├── package.json           # Dependencies
├── .env                   # Environment config
├── .htaccess              # Apache config
├── config/
│   └── database.js        # Database connection
├── scripts/
│   ├── schema.sql         # Database schema
│   └── production-setup.js # Setup script
├── uploads/               # File uploads
├── logs/                  # Application logs
└── backups/               # Database backups
```

## 🛡️ Security Considerations

### 1. File Permissions

Set appropriate permissions in cPanel File Manager:

- `.env`: 600 (owner read/write only)
- `*.js`: 644 (owner read/write, others read)
- `uploads/`: 755 (directory with upload access)

### 2. Database Security

- Use strong passwords
- Limit database user privileges
- Enable SSL if available

### 3. SSL Certificate

1. Go to **SSL/TLS** in cPanel
2. Install SSL certificate (Let's Encrypt is free)
3. Force HTTPS redirects

## 📊 Monitoring and Maintenance

### Log Files

Monitor application logs in cPanel:

- **Node.js Selector** > **View Logs**
- Check `logs/` directory for custom logs

### Database Backups

Run automated backups:

```bash
# Manual backup
node scripts/backup-mysql.js create

# Automated (set up cron job)
0 2 * * * cd /home/username/public_html/api && node scripts/backup-mysql.js create
```

### Performance Monitoring

- Monitor CPU and memory usage in cPanel
- Check database query performance
- Set up uptime monitoring

## 🔄 Updates and Maintenance

### Updating the Application

1. Upload new files via File Manager or FTP
2. Install new dependencies: `npm install`
3. Restart the Node.js app in cPanel
4. Run database migrations if needed

### Scaling Considerations

- Use cPanel's Node.js resource limits
- Consider CDN for static files
- Implement database indexing
- Monitor and optimize slow queries

## 🆘 Troubleshooting

### Common Issues

#### Application Won't Start

1. Check Node.js logs in cPanel
2. Verify `.env` configuration
3. Ensure database connection
4. Check file permissions

#### Database Connection Errors

1. Verify database credentials
2. Check database server status
3. Test connection manually:

```bash
mysql -h localhost -u username_dbuser -p username_bizzleap
```

#### CORS Errors

1. Update `.htaccess` with correct origins
2. Check `FRONTEND_URL` in `.env`
3. Verify Apache mod_headers is enabled

#### File Upload Issues

1. Check `uploads/` directory permissions
2. Verify disk space availability
3. Check upload size limits

### Debug Mode

Enable debug logging:

```env
LOG_LEVEL=debug
NODE_ENV=development
```

## 📞 Support

If you encounter issues:

1. Check the error logs in cPanel
2. Verify all configuration settings
3. Test individual API endpoints
4. Contact your hosting provider for Node.js support

## 🎉 Success!

Your BizzLeap application should now be running on:

- **API**: `https://bizzleap.lontain.com/api/health`
- **Frontend**: Upload the web app files to serve the frontend

The application is now ready for production use with:

- ✅ MySQL database integration
- ✅ Secure authentication
- ✅ File upload handling
- ✅ Production-ready configuration
- ✅ Error handling and logging
- ✅ CORS configuration
- ✅ Security headers
