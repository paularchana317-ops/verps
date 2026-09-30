const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { isMongoConnected } = require('../config/mongodb');
const User = require('../models/User');
const { generateVendorId } = require('./vendorController');

// Supported roles
const VALID_ROLES = ['Admin', 'User/Requester', 'Vendor', 'admin', 'user', 'vendor'];

/**
 * Normalize role to standard VEPRS casing
 */
function canonicalRole(role) {
  if (!role) return 'User/Requester';
  const r = role.toString().toLowerCase().trim();
  if (r === 'admin') return 'Admin';
  if (r === 'vendor') return 'Vendor';
  if (r.includes('user') || r.includes('requester')) return 'User/Requester';
  return role;
}

/**
 * Register a new user or vendor account
 * Stores user permanently in MongoDB Atlas (and syncs with local tables for relational consistency).
 */
async function register(req, res) {
  let connection;
  try {
    const { 
      name, 
      email, 
      password, 
      confirmPassword, 
      role, 
      vendorName, 
      companyName, 
      phone, 
      address, 
      city, 
      state, 
      productCategories, 
      businessRegistrationNumber, 
      description 
    } = req.body;

    // 1. Validate required fields
    if (!name || !email || !password || !confirmPassword || !role) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required (Name, Email, Password, Confirm Password, Role).'
      });
    }

    // 2. Trim inputs
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (trimmedName.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Full Name must be at least 2 characters long.'
      });
    }

    // 3. Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.'
      });
    }

    // 4. Validate role
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role selected. Allowed roles: Admin, User/Requester, Vendor`
      });
    }

    const normalizedRole = canonicalRole(role);

    // 5. Check password matching
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Password and Confirm Password do not match.'
      });
    }

    // 6. Check password security requirements (min 6 characters, includes letter and number)
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.'
      });
    }

    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasLetter || !hasNumber) {
      return res.status(400).json({
        success: false,
        message: 'Password must contain at least one letter and one number.'
      });
    }

    // 7. Check if email already exists in MongoDB Atlas
    if (isMongoConnected()) {
      const existingMongoUser = await User.findOne({ email: trimmedEmail });
      if (existingMongoUser) {
        return res.status(409).json({
          success: false,
          message: normalizedRole === 'Vendor' 
            ? 'Vendor with this email already exists. Please login instead.' 
            : 'An account with this email already exists. Please login instead.'
        });
      }
    }

    // Also check SQL users & vendors table
    try {
      const [existingSqlUsers] = await pool.query(
        'SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1',
        [trimmedEmail]
      );
      if (existingSqlUsers.length > 0) {
        return res.status(409).json({
          success: false,
          message: normalizedRole === 'Vendor' 
            ? 'Vendor with this email already exists. Please login instead.' 
            : 'An account with this email already exists. Please login instead.'
        });
      }

      const [existingVendors] = await pool.query(
        'SELECT id FROM vendors WHERE LOWER(email) = ? LIMIT 1',
        [trimmedEmail]
      );
      if (existingVendors.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Vendor with this email already exists. Please login instead.'
        });
      }
    } catch (sqlCheckErr) {
      // Non-blocking if table is initializing
    }

    // 8. Hash password using bcrypt
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 9. Generate vendor ID if role is Vendor
    let generatedVendorId = null;
    if (normalizedRole === 'Vendor') {
      generatedVendorId = await generateVendorId(connection);
    }

    // 10. Store user in MongoDB Atlas
    let mongoUserId = null;
    if (isMongoConnected()) {
      const newMongoUser = await User.create({
        name: trimmedName,
        email: trimmedEmail,
        password: hashedPassword,
        role: normalizedRole,
        vendorId: generatedVendorId
      });
      mongoUserId = newMongoUser._id.toString();
    }

    // 11. Insert into SQL users table (maintains relational integrity for existing Sprint 1 & 2 foreign keys)
    const [userResult] = await connection.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [trimmedName, trimmedEmail, hashedPassword, normalizedRole]
    );
    const sqlUserId = userResult.insertId;

    // 12. If Role is Vendor, create entry in vendors table
    if (normalizedRole === 'Vendor') {
      const finalVendorName = (vendorName && vendorName.trim()) 
        ? vendorName.trim() 
        : ((companyName && companyName.trim()) ? companyName.trim() : trimmedName);
      const finalPhone = (phone && phone.trim()) ? phone.trim() : 'N/A';
      const finalAddress = (address && address.trim()) ? address.trim() : 'N/A';
      const finalCategory = (productCategories && productCategories.trim()) 
        ? productCategories.trim() 
        : 'Computer Accessories';

      await connection.query(
        `INSERT INTO vendors 
          (vendor_id, vendor_name, contact_person, email, phone, address, city, state, product_categories, business_registration_number, description, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generatedVendorId,
          finalVendorName,
          trimmedName,
          trimmedEmail,
          finalPhone,
          finalAddress,
          city ? city.trim() : '',
          state ? state.trim() : '',
          finalCategory,
          businessRegistrationNumber ? businessRegistrationNumber.trim() : null,
          description ? description.trim() : 'Registered Supplier Partner',
          'Active'
        ]
      );
    }

    await connection.commit();
    connection.release();

    return res.status(201).json({
      success: true,
      message: normalizedRole === 'Vendor' 
        ? `Vendor registration successful! Assigned Vendor ID: ${generatedVendorId}. You can now log in.` 
        : 'Registration successful! You can now log in with your credentials.',
      userId: mongoUserId || sqlUserId,
      vendorId: generatedVendorId
    });

  } catch (err) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error('[Auth Register Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during registration. Please try again later.'
    });
  }
}

/**
 * User / Vendor Login
 * Queries MongoDB Atlas users collection as the source of truth.
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    // 1. Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // 2. Fetch user - checks MongoDB Atlas first
    let user = null;
    let isFromMongo = false;

    if (isMongoConnected()) {
      user = await User.findOne({ email: trimmedEmail });
      if (user) {
        isFromMongo = true;
      }
    }

    // Fallback to local SQL database if not in MongoDB or MongoDB URI not yet set
    if (!user) {
      const [sqlUsers] = await pool.query(
        'SELECT id, name, email, password, role, created_at FROM users WHERE LOWER(email) = ? LIMIT 1',
        [trimmedEmail]
      );
      if (sqlUsers.length > 0) {
        user = sqlUsers[0];
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // 3. Verify password with bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // 4. Normalize role
    const normRole = canonicalRole(user.role);

    // 5. If role is Vendor, load vendor profile
    let vendorData = null;
    if (normRole === 'Vendor') {
      try {
        const [vendorRows] = await pool.query(
          'SELECT id, vendor_id, vendor_name, email, phone, product_categories, status FROM vendors WHERE LOWER(email) = ? LIMIT 1',
          [trimmedEmail]
        );
        if (vendorRows.length > 0) {
          vendorData = vendorRows[0];
        }
      } catch (e) {
        // Fallback vendor data
      }
    }

    // 6. Generate JWT Token
    const jwtSecret = process.env.JWT_SECRET || 'veprs_super_secure_jwt_secret_key_2026_auth';
    const expiresIn = process.env.JWT_EXPIRES_IN || '24h';

    const userIdStr = user._id ? user._id.toString() : (user.id ? String(user.id) : '');
    const vendorIdStr = user.vendorId || (vendorData ? vendorData.vendor_id : null);

    const tokenPayload = {
      id: userIdStr,
      name: user.name,
      email: user.email,
      role: normRole,
      vendorId: vendorIdStr
    };

    const token = jwt.sign(tokenPayload, jwtSecret, { expiresIn });

    // 7. Determine redirect URL based on verified role
    let redirectUrl = '/user-dashboard.html';
    if (normRole === 'Admin') {
      redirectUrl = '/admin-dashboard.html';
    } else if (normRole === 'Vendor') {
      redirectUrl = '/vendor-dashboard.html';
    } else {
      redirectUrl = '/user-dashboard.html';
    }

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: userIdStr,
        name: user.name,
        email: user.email,
        role: normRole,
        vendorId: vendorIdStr,
        vendorName: vendorData ? vendorData.vendor_name : user.name,
        status: vendorData ? vendorData.status : 'Active'
      },
      redirectUrl
    });

  } catch (err) {
    console.error('[Auth Login Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during login. Please try again later.'
    });
  }
}

/**
 * Get Authenticated User Profile
 */
async function getProfile(req, res) {
  try {
    const userEmail = req.user.email ? req.user.email.toLowerCase() : null;
    let user = null;

    if (isMongoConnected() && userEmail) {
      user = await User.findOne({ email: userEmail });
    }

    if (!user) {
      const userId = req.user.id;
      const [sqlUsers] = await pool.query(
        'SELECT id, name, email, role, created_at FROM users WHERE id = ? OR LOWER(email) = ? LIMIT 1',
        [userId, userEmail]
      );
      if (sqlUsers.length > 0) {
        user = sqlUsers[0];
      }
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    const normRole = canonicalRole(user.role);
    let vendorData = null;

    if (normRole === 'Vendor') {
      try {
        const [vendorRows] = await pool.query(
          'SELECT id, vendor_id, vendor_name, contact_person, email, phone, address, city, state, product_categories, business_registration_number, description, status FROM vendors WHERE LOWER(email) = ? LIMIT 1',
          [user.email.toLowerCase()]
        );
        if (vendorRows.length > 0) {
          vendorData = vendorRows[0];
        }
      } catch (e) {
        // Ignored
      }
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user._id ? user._id.toString() : user.id,
        name: user.name,
        email: user.email,
        role: normRole,
        vendorProfile: vendorData
      }
    });
  } catch (err) {
    console.error('[Auth Profile Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve profile.'
    });
  }
}

module.exports = {
  register,
  login,
  getProfile
};
