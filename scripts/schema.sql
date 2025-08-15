-- BizzLeap Production Database Schema
-- MySQL/MariaDB compatible

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  firstName VARCHAR(100) NOT NULL,
  lastName VARCHAR(100) NOT NULL,
  role ENUM('farmer', 'business', 'buyer') DEFAULT NULL,
  phone VARCHAR(20) DEFAULT NULL,
  bio TEXT DEFAULT NULL,
  avatar VARCHAR(500) DEFAULT NULL,
  country VARCHAR(2) DEFAULT NULL,
  state VARCHAR(100) DEFAULT NULL,
  city VARCHAR(100) DEFAULT NULL,
  location VARCHAR(255) DEFAULT NULL,
  zipCode VARCHAR(20) DEFAULT NULL,
  profileSetup BOOLEAN DEFAULT FALSE,

  -- Farmer specific fields
  farmName VARCHAR(255) DEFAULT NULL,
  farmSize VARCHAR(50) DEFAULT NULL,
  farmType VARCHAR(100) DEFAULT NULL,
  productsGrown TEXT DEFAULT NULL,
  organicCertified BOOLEAN DEFAULT FALSE,

  -- Business specific fields
  businessName VARCHAR(255) DEFAULT NULL,
  businessType VARCHAR(100) DEFAULT NULL,
  servicesOffered TEXT DEFAULT NULL,
  yearsInBusiness INT DEFAULT NULL,
  website VARCHAR(500) DEFAULT NULL,

  -- Buyer specific fields
  buyerType ENUM('individual', 'restaurant', 'retailer') DEFAULT 'individual',
  interests TEXT DEFAULT NULL,
  monthlyBudget VARCHAR(50) DEFAULT NULL,

  -- Currency and location
  currency VARCHAR(3) DEFAULT 'USD',
  timezone VARCHAR(50) DEFAULT NULL,
  language VARCHAR(5) DEFAULT 'en',

  -- Social authentication
  socialId VARCHAR(255) DEFAULT NULL,
  socialProvider ENUM('google', 'facebook', 'twitter', 'github') DEFAULT NULL,

  -- Account status
  emailVerified BOOLEAN DEFAULT FALSE,
  isActive BOOLEAN DEFAULT TRUE,
  lastLogin DATETIME DEFAULT NULL,

  -- Timestamps
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Indexes
  INDEX idx_email (email),
  INDEX idx_role (role),
  INDEX idx_country (country),
  INDEX idx_location (country, state, city),
  INDEX idx_created (createdAt),
  INDEX idx_active (isActive),
  INDEX idx_social (socialId, socialProvider),
  UNIQUE KEY unique_social (socialId, socialProvider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT DEFAULT NULL,
  type ENUM('product', 'service', 'both') DEFAULT 'both',
  parentId INT DEFAULT NULL,
  icon VARCHAR(100) DEFAULT NULL,
  color VARCHAR(7) DEFAULT NULL,
  isActive BOOLEAN DEFAULT TRUE,
  sortOrder INT DEFAULT 0,

  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (parentId) REFERENCES categories(id) ON DELETE SET NULL,
  INDEX idx_slug (slug),
  INDEX idx_type (type),
  INDEX idx_parent (parentId),
  INDEX idx_active (isActive)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  categoryId INT DEFAULT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  shortDescription VARCHAR(500) DEFAULT NULL,

  -- Pricing
  price DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  pricePerUnit DECIMAL(10,2) DEFAULT NULL,
  unit VARCHAR(50) DEFAULT 'piece',

  -- Inventory
  quantity INT DEFAULT 0,
  minOrderQuantity INT DEFAULT 1,
  maxOrderQuantity INT DEFAULT NULL,
  inStock BOOLEAN DEFAULT TRUE,

  -- Product details
  sku VARCHAR(100) DEFAULT NULL,
  weight DECIMAL(8,2) DEFAULT NULL,
  dimensions VARCHAR(100) DEFAULT NULL,
  organic BOOLEAN DEFAULT FALSE,

  -- Location
  location VARCHAR(255) DEFAULT NULL,
  latitude DECIMAL(10, 8) DEFAULT NULL,
  longitude DECIMAL(11, 8) DEFAULT NULL,

  -- Farm/Source details
  farmName VARCHAR(255) DEFAULT NULL,
  harvestDate DATE DEFAULT NULL,
  expiryDate DATE DEFAULT NULL,

  -- Media
  images JSON DEFAULT NULL,
  videos JSON DEFAULT NULL,

  -- SEO and metadata
  slug VARCHAR(255) DEFAULT NULL,
  tags JSON DEFAULT NULL,
  metaTitle VARCHAR(255) DEFAULT NULL,
  metaDescription TEXT DEFAULT NULL,

  -- Status and visibility
  status ENUM('draft', 'active', 'inactive', 'sold') DEFAULT 'draft',
  featured BOOLEAN DEFAULT FALSE,
  verified BOOLEAN DEFAULT FALSE,

  -- Statistics
  viewCount INT DEFAULT 0,
  favoriteCount INT DEFAULT 0,
  orderCount INT DEFAULT 0,
  rating DECIMAL(3,2) DEFAULT 0.00,
  reviewCount INT DEFAULT 0,

  -- Timestamps
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  publishedAt DATETIME DEFAULT NULL,

  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE SET NULL,

  INDEX idx_user (userId),
  INDEX idx_category (categoryId),
  INDEX idx_status (status),
  INDEX idx_location (latitude, longitude),
  INDEX idx_price (price),
  INDEX idx_created (createdAt),
  INDEX idx_featured (featured),
  INDEX idx_slug (slug),
  FULLTEXT idx_search (name, description, tags)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Services table
CREATE TABLE IF NOT EXISTS services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  categoryId INT DEFAULT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  shortDescription VARCHAR(500) DEFAULT NULL,

  -- Pricing
  price DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  priceType ENUM('fixed', 'hourly', 'daily', 'monthly', 'custom') DEFAULT 'fixed',

  -- Service details
  duration VARCHAR(100) DEFAULT NULL,
  availability ENUM('available', 'busy', 'unavailable') DEFAULT 'available',
  serviceArea VARCHAR(255) DEFAULT NULL,

  -- Location
  location VARCHAR(255) DEFAULT NULL,
  latitude DECIMAL(10, 8) DEFAULT NULL,
  longitude DECIMAL(11, 8) DEFAULT NULL,

  -- Business details
  businessName VARCHAR(255) DEFAULT NULL,
  businessLicense VARCHAR(100) DEFAULT NULL,
  insurance BOOLEAN DEFAULT FALSE,

  -- Media
  images JSON DEFAULT NULL,
  videos JSON DEFAULT NULL,
  portfolio JSON DEFAULT NULL,

  -- SEO and metadata
  slug VARCHAR(255) DEFAULT NULL,
  tags JSON DEFAULT NULL,
  metaTitle VARCHAR(255) DEFAULT NULL,
  metaDescription TEXT DEFAULT NULL,

  -- Status and visibility
  status ENUM('draft', 'active', 'inactive', 'paused') DEFAULT 'draft',
  featured BOOLEAN DEFAULT FALSE,
  verified BOOLEAN DEFAULT FALSE,

  -- Statistics
  viewCount INT DEFAULT 0,
  favoriteCount INT DEFAULT 0,
  orderCount INT DEFAULT 0,
  rating DECIMAL(3,2) DEFAULT 0.00,
  reviewCount INT DEFAULT 0,

  -- Timestamps
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  publishedAt DATETIME DEFAULT NULL,

  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE SET NULL,

  INDEX idx_user (userId),
  INDEX idx_category (categoryId),
  INDEX idx_status (status),
  INDEX idx_location (latitude, longitude),
  INDEX idx_price (price),
  INDEX idx_created (createdAt),
  INDEX idx_featured (featured),
  INDEX idx_slug (slug),
  FULLTEXT idx_search (name, description, tags)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  orderNumber VARCHAR(50) NOT NULL UNIQUE,
  buyerId INT NOT NULL,
  sellerId INT NOT NULL,

  -- Order type
  type ENUM('product', 'service') NOT NULL,
  productId INT DEFAULT NULL,
  serviceId INT DEFAULT NULL,

  -- Order details
  quantity INT NOT NULL DEFAULT 1,
  unitPrice DECIMAL(10,2) NOT NULL,
  totalAmount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',

  -- Delivery/Service details
  deliveryAddress TEXT DEFAULT NULL,
  deliveryDate DATE DEFAULT NULL,
  serviceDate DATE DEFAULT NULL,

  -- Payment
  paymentMethod VARCHAR(50) DEFAULT NULL,
  paymentStatus ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
  paymentId VARCHAR(255) DEFAULT NULL,

  -- Order status
  status ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'completed', 'cancelled', 'disputed') DEFAULT 'pending',

  -- Communication
  notes TEXT DEFAULT NULL,
  buyerNotes TEXT DEFAULT NULL,
  sellerNotes TEXT DEFAULT NULL,

  -- Timestamps
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  confirmedAt DATETIME DEFAULT NULL,
  shippedAt DATETIME DEFAULT NULL,
  deliveredAt DATETIME DEFAULT NULL,
  completedAt DATETIME DEFAULT NULL,
  cancelledAt DATETIME DEFAULT NULL,

  FOREIGN KEY (buyerId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (sellerId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (productId) REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (serviceId) REFERENCES services(id) ON DELETE SET NULL,

  INDEX idx_buyer (buyerId),
  INDEX idx_seller (sellerId),
  INDEX idx_product (productId),
  INDEX idx_service (serviceId),
  INDEX idx_status (status),
  INDEX idx_payment_status (paymentStatus),
  INDEX idx_created (createdAt),
  INDEX idx_order_number (orderNumber)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  orderId INT NOT NULL,
  reviewerId INT NOT NULL,
  revieweeId INT NOT NULL,

  -- Review details
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title VARCHAR(255) DEFAULT NULL,
  comment TEXT DEFAULT NULL,

  -- Review type
  type ENUM('buyer_to_seller', 'seller_to_buyer') NOT NULL,

  -- Status
  status ENUM('pending', 'approved', 'rejected', 'hidden') DEFAULT 'pending',
  isVerified BOOLEAN DEFAULT FALSE,

  -- Response
  response TEXT DEFAULT NULL,
  respondedAt DATETIME DEFAULT NULL,

  -- Timestamps
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewerId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (revieweeId) REFERENCES users(id) ON DELETE CASCADE,

  UNIQUE KEY unique_review (orderId, reviewerId, type),
  INDEX idx_order (orderId),
  INDEX idx_reviewer (reviewerId),
  INDEX idx_reviewee (revieweeId),
  INDEX idx_rating (rating),
  INDEX idx_status (status),
  INDEX idx_created (createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  orderId INT DEFAULT NULL,
  senderId INT NOT NULL,
  receiverId INT NOT NULL,

  -- Message content
  subject VARCHAR(255) DEFAULT NULL,
  message TEXT NOT NULL,
  messageType ENUM('text', 'image', 'file', 'system') DEFAULT 'text',

  -- Attachments
  attachments JSON DEFAULT NULL,

  -- Status
  isRead BOOLEAN DEFAULT FALSE,
  readAt DATETIME DEFAULT NULL,

  -- Timestamps
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (senderId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiverId) REFERENCES users(id) ON DELETE CASCADE,

  INDEX idx_order (orderId),
  INDEX idx_sender (senderId),
  INDEX idx_receiver (receiverId),
  INDEX idx_conversation (senderId, receiverId),
  INDEX idx_read_status (isRead),
  INDEX idx_created (createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,

  -- Notification details
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('order', 'payment', 'review', 'system', 'promotion') NOT NULL,

  -- Related records
  relatedType ENUM('order', 'product', 'service', 'user', 'review') DEFAULT NULL,
  relatedId INT DEFAULT NULL,

  -- Status
  isRead BOOLEAN DEFAULT FALSE,
  readAt DATETIME DEFAULT NULL,

  -- Delivery
  channels JSON DEFAULT NULL, -- email, push, sms
  sentAt DATETIME DEFAULT NULL,

  -- Timestamps
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expiresAt DATETIME DEFAULT NULL,

  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,

  INDEX idx_user (userId),
  INDEX idx_type (type),
  INDEX idx_read_status (isRead),
  INDEX idx_created (createdAt),
  INDEX idx_expires (expiresAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User sessions table (for JWT token management)
CREATE TABLE IF NOT EXISTS user_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  token VARCHAR(500) NOT NULL,
  deviceInfo TEXT DEFAULT NULL,
  ipAddress VARCHAR(45) DEFAULT NULL,
  userAgent TEXT DEFAULT NULL,

  -- Status
  isActive BOOLEAN DEFAULT TRUE,

  -- Timestamps
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  expiresAt DATETIME NOT NULL,
  lastUsedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,

  INDEX idx_user (userId),
  INDEX idx_token (token),
  INDEX idx_active (isActive),
  INDEX idx_expires (expiresAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default categories
INSERT IGNORE INTO categories (name, slug, description, type) VALUES
('Vegetables', 'vegetables', 'Fresh vegetables and greens', 'product'),
('Fruits', 'fruits', 'Fresh fruits and berries', 'product'),
('Grains', 'grains', 'Cereals, rice, wheat, and other grains', 'product'),
('Dairy', 'dairy', 'Milk, cheese, yogurt, and dairy products', 'product'),
('Meat & Poultry', 'meat-poultry', 'Fresh meat, chicken, and poultry', 'product'),
('Herbs & Spices', 'herbs-spices', 'Fresh and dried herbs and spices', 'product'),
('Farm Equipment', 'farm-equipment', 'Tools, machinery, and farming equipment', 'both'),
('Consulting', 'consulting', 'Agricultural consulting and advisory services', 'service'),
('Transportation', 'transportation', 'Delivery and transport services', 'service'),
('Maintenance', 'maintenance', 'Equipment maintenance and repair services', 'service');
