const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { generateVendorId } = require('./vendorController');

// Valid roles
const VALID_ROLES = ['Admin', 'User/Requester', 'Vendor'];

/**
 * Register a new user or vendor account
 * When role === 'Vendor', automatically creates user + vendor profile in unified vendors list.
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
        message: `Invalid role selected. Allowed roles: ${VALID_ROLES.join(', ')}`
      });
    }

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

    // 7. Check if email already exists in users or vendors table
    const [existingUsers] = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1',
      [trimmedEmail]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: role === 'Vendor' 
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

    // 8. Hash password using bcrypt
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 9. Insert into users table
    const [userResult] = await connection.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [trimmedName, trimmedEmail, hashedPassword, role]
    );
    const userId = userResult.insertId;

    let generatedVendorId = null;

    // 10. If Role is Vendor, automatically generate Vendor ID and create record in vendors table
    if (role === 'Vendor') {
      generatedVendorId = await generateVendorId(connection);
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
      message: role === 'Vendor' 
        ? `Vendor registration successful! Assigned Vendor ID: ${generatedVendorId}. You can now log in.` 
        : 'Registration successful! You can now log in with your credentials.',
      userId: userId,
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
 * User / Vendor Login (Authenticates existing account, NEVER creates duplicates)
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

    // 2. Fetch user by email
    const [users] = await pool.query(
      'SELECT id, name, email, password, role, created_at FROM users WHERE LOWER(email) = ? LIMIT 1',
      [trimmedEmail]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    const user = users[0];

    // 3. Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // 4. If role is Vendor, load existing vendor profile without creating duplicate records
    let vendorData = null;
    if (user.role === 'Vendor') {
      const [vendorRows] = await pool.query(
        'SELECT id, vendor_id, vendor_name, email, phone, product_categories, status FROM vendors WHERE LOWER(email) = ? LIMIT 1',
        [trimmedEmail]
      );

      if (vendorRows.length > 0) {
        vendorData = vendorRows[0];
      }
    }

    // 5. Generate JWT Token
    const jwtSecret = process.env.JWT_SECRET || 'veprs_super_secure_jwt_secret_key_2026_auth';
    const expiresIn = process.env.JWT_EXPIRES_IN || '24h';

    const tokenPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      vendorId: vendorData ? vendorData.vendor_id : null
    };

    const token = jwt.sign(tokenPayload, jwtSecret, { expiresIn });

    // 6. Determine redirect URL based on role
    let redirectUrl = '/user-dashboard.html';
    if (user.role === 'Admin') {
      redirectUrl = '/admin-dashboard.html';
    } else if (user.role === 'Vendor') {
      redirectUrl = '/vendor-dashboard.html';
    } else if (user.role === 'User/Requester') {
      redirectUrl = '/user-dashboard.html';
    }

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        vendorId: vendorData ? vendorData.vendor_id : null,
        vendorName: vendorData ? vendorData.vendor_name : null,
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
    const userId = req.user.id;
    const [users] = await pool.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    const user = users[0];
    let vendorData = null;

    if (user.role === 'Vendor') {
      const [vendorRows] = await pool.query(
        'SELECT id, vendor_id, vendor_name, contact_person, email, phone, address, city, state, product_categories, business_registration_number, description, status FROM vendors WHERE LOWER(email) = ? LIMIT 1',
        [user.email.toLowerCase()]
      );
      if (vendorRows.length > 0) {
        vendorData = vendorRows[0];
      }
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
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
