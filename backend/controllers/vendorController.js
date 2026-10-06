const { pool } = require('../config/db');
const { isMongoConnected } = require('../config/mongodb');
const Vendor = require('../models/Vendor');

/**
 * Generate Next Unique Vendor ID (e.g. VEN-1001, VEN-1002, ...)
 * @param {object} connection - MySQL or SQLite connection / pool
 * @returns {Promise<string>}
 */
async function generateVendorId(connection) {
  const [rows] = await connection.query(
    'SELECT vendor_id FROM vendors ORDER BY id DESC LIMIT 1'
  );

  let nextSeq = 1001;
  if (rows.length > 0 && rows[0].vendor_id) {
    const match = rows[0].vendor_id.match(/VEN-(\d+)/i);
    if (match && match[1]) {
      const currentNumber = parseInt(match[1], 10);
      if (!isNaN(currentNumber)) {
        nextSeq = Math.max(nextSeq, currentNumber + 1);
      }
    }
  }

  return `VEN-${nextSeq}`;
}

/**
 * Add New Vendor (SCRUM-22 - Admin only)
 */
async function addVendor(req, res) {
  try {
    const {
      vendorName,
      contactPerson,
      email,
      phone,
      address,
      city,
      state,
      productCategories,
      businessRegistrationNumber,
      description
    } = req.body;

    // 1. Validation - Required fields
    if (!vendorName || !vendorName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vendor Name is required.'
      });
    }

    if (!contactPerson || !contactPerson.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Contact Person is required.'
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required.'
      });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.'
      });
    }

    if (!phone || !phone.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required.'
      });
    }

    const phoneRegex = /^[0-9+\-\s()]{7,20}$/;
    if (!phoneRegex.test(phone.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid phone number.'
      });
    }

    if (!address || !address.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Address is required.'
      });
    }

    const categories = productCategories && productCategories.trim() ? productCategories.trim() : 'Computer Accessories';

    // 2. Check for duplicate vendor email in vendors and users tables
    const [existing] = await pool.query(
      'SELECT id FROM vendors WHERE LOWER(email) = ? LIMIT 1',
      [trimmedEmail]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Vendor with this email already exists.'
      });
    }

    // 3. Generate unique Vendor ID (VEN-1001)
    const vendorId = await generateVendorId(pool);

    // 4. Insert into database
    const [result] = await pool.query(
      `INSERT INTO vendors 
        (vendor_id, vendor_name, contact_person, email, phone, address, city, state, product_categories, business_registration_number, description, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        vendorId,
        vendorName.trim(),
        contactPerson.trim(),
        trimmedEmail,
        phone.trim(),
        address.trim(),
        city ? city.trim() : '',
        state ? state.trim() : '',
        categories,
        businessRegistrationNumber ? businessRegistrationNumber.trim() : null,
        description ? description.trim() : null,
        'Active'
      ]
    );

    // Sync with MongoDB Atlas if connected
    if (isMongoConnected()) {
      try {
        await Vendor.create({
          vendor_id: vendorId,
          vendor_name: vendorName.trim(),
          contact_person: contactPerson.trim(),
          email: trimmedEmail,
          phone: phone.trim(),
          address: address.trim(),
          city: city ? city.trim() : '',
          state: state ? state.trim() : '',
          product_categories: categories,
          business_registration_number: businessRegistrationNumber ? businessRegistrationNumber.trim() : null,
          description: description ? description.trim() : null,
          status: 'Active'
        });
      } catch (mErr) {
        console.warn('[MongoDB Vendor Sync Warning]:', mErr.message);
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Vendor added successfully.',
      vendorId: vendorId,
      data: {
        id: result.insertId,
        vendorId,
        vendorName: vendorName.trim(),
        contactPerson: contactPerson.trim(),
        email: trimmedEmail,
        phone: phone.trim(),
        address: address.trim(),
        city: city ? city.trim() : '',
        state: state ? state.trim() : '',
        productCategories: categories,
        businessRegistrationNumber: businessRegistrationNumber ? businessRegistrationNumber.trim() : null,
        description: description ? description.trim() : null,
        status: 'Active'
      }
    });
  } catch (err) {
    console.error('[Add Vendor Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while adding vendor.'
    });
  }
}

/**
 * Get All Vendors (Admin only)
 */
async function getAllVendors(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT 
        id,
        vendor_id,
        vendor_name,
        contact_person,
        email,
        phone,
        address,
        city,
        state,
        product_categories,
        business_registration_number,
        description,
        status,
        DATE_FORMAT(created_at, '%d-%m-%Y') AS created_date,
        created_at
       FROM vendors 
       ORDER BY id DESC`
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      vendors: rows
    });
  } catch (err) {
    console.error('[Get All Vendors Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve vendors.'
    });
  }
}

/**
 * Get Active Vendors (for Quotation Request selection)
 */
async function getActiveVendors(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT 
        id,
        vendor_id,
        vendor_name,
        contact_person,
        email,
        phone,
        city,
        state,
        product_categories,
        status
       FROM vendors 
       WHERE status = 'Active' 
       ORDER BY vendor_name ASC`
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      vendors: rows
    });
  } catch (err) {
    console.error('[Get Active Vendors Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve active vendors.'
    });
  }
}

/**
 * Get Public Recommended Vendors (Public endpoint for Home Page before login)
 */
async function getPublicRecommendedVendors(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT 
        id,
        vendor_id,
        vendor_name,
        contact_person,
        city,
        state,
        product_categories,
        description,
        status
       FROM vendors 
       WHERE status = 'Active' 
       ORDER BY id ASC`
    );

    const ratings = [4.9, 4.8, 4.7, 4.9, 4.6];
    const badges = ['Top Rated Supplier', 'Verified Hardware Partner', 'Enterprise Supplier', 'Fast Fulfillment', 'Preferred Distributor'];

    const recommended = rows.map((v, index) => ({
      ...v,
      rating: ratings[index % ratings.length],
      badge: badges[index % badges.length],
      category: v.product_categories || 'Computer Accessories'
    }));

    return res.status(200).json({
      success: true,
      count: recommended.length,
      vendors: recommended
    });
  } catch (err) {
    console.error('[Get Recommended Vendors Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve recommended vendors.'
    });
  }
}

/**
 * Get Vendor By ID
 */
async function getVendorById(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT 
        id,
        vendor_id,
        vendor_name,
        contact_person,
        email,
        phone,
        address,
        city,
        state,
        product_categories,
        business_registration_number,
        description,
        status,
        created_at
       FROM vendors 
       WHERE id = ? OR vendor_id = ? 
       LIMIT 1`,
      [id, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found.'
      });
    }

    return res.status(200).json({
      success: true,
      vendor: rows[0]
    });
  } catch (err) {
    console.error('[Get Vendor By ID Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve vendor details.'
    });
  }
}

/**
 * Update Vendor (SCRUM-23 - Admin only)
 */
async function updateVendor(req, res) {
  try {
    const { id } = req.params;
    const {
      vendorName,
      contactPerson,
      email,
      phone,
      address,
      city,
      state,
      productCategories,
      businessRegistrationNumber,
      description,
      status
    } = req.body;

    // 1. Check if vendor exists
    const [vendorCheck] = await pool.query(
      'SELECT id, vendor_id, email FROM vendors WHERE id = ? OR vendor_id = ? LIMIT 1',
      [id, id]
    );

    if (vendorCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found.'
      });
    }

    const currentVendor = vendorCheck[0];
    const numericId = currentVendor.id;

    // 2. Validate fields
    if (!vendorName || !vendorName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vendor Name is required.'
      });
    }

    if (!contactPerson || !contactPerson.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Contact Person is required.'
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required.'
      });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.'
      });
    }

    if (!phone || !phone.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required.'
      });
    }

    if (!address || !address.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Address is required.'
      });
    }

    const categories = productCategories && productCategories.trim() ? productCategories.trim() : 'Computer Accessories';

    const validStatuses = ['Active', 'Inactive'];
    const updatedStatus = status && validStatuses.includes(status) ? status : 'Active';

    // 3. Check for duplicate email across other vendors
    const [duplicateEmail] = await pool.query(
      'SELECT id FROM vendors WHERE LOWER(email) = ? AND id != ? LIMIT 1',
      [trimmedEmail, numericId]
    );

    if (duplicateEmail.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Another vendor already uses this email address.'
      });
    }

    // 4. Update in database
    await pool.query(
      `UPDATE vendors SET 
        vendor_name = ?,
        contact_person = ?,
        email = ?,
        phone = ?,
        address = ?,
        city = ?,
        state = ?,
        product_categories = ?,
        business_registration_number = ?,
        description = ?,
        status = ?
       WHERE id = ?`,
      [
        vendorName.trim(),
        contactPerson.trim(),
        trimmedEmail,
        phone.trim(),
        address.trim(),
        city ? city.trim() : '',
        state ? state.trim() : '',
        categories,
        businessRegistrationNumber ? businessRegistrationNumber.trim() : null,
        description ? description.trim() : null,
        updatedStatus,
        numericId
      ]
    );

    // Sync with MongoDB Atlas if connected
    if (isMongoConnected()) {
      try {
        await Vendor.findOneAndUpdate(
          { vendor_id: currentVendor.vendor_id },
          {
            vendor_name: vendorName.trim(),
            contact_person: contactPerson.trim(),
            email: trimmedEmail,
            phone: phone.trim(),
            address: address.trim(),
            city: city ? city.trim() : '',
            state: state ? state.trim() : '',
            product_categories: categories,
            business_registration_number: businessRegistrationNumber ? businessRegistrationNumber.trim() : null,
            description: description ? description.trim() : null,
            status: updatedStatus,
            updatedAt: new Date()
          }
        );
      } catch (mErr) {
        console.warn('[MongoDB Vendor Update Warning]:', mErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Vendor details updated successfully.',
      vendorId: currentVendor.vendor_id
    });
  } catch (err) {
    console.error('[Update Vendor Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while updating vendor.'
    });
  }
}

module.exports = {
  generateVendorId,
  addVendor,
  getAllVendors,
  getActiveVendors,
  getPublicRecommendedVendors,
  getVendorById,
  updateVendor
};
