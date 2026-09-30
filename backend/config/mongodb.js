const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { pool } = require('./db');

let isConnected = false;

function isMongoConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

/**
 * Seed required default test accounts if they do not exist
 */
async function seedDefaultAccounts() {
  try {
    const defaultAccounts = [
      {
        name: 'System Admin',
        email: 'admin@gmail.com',
        plainPassword: 'admin123',
        role: 'Admin',
        vendorId: null
      },
      {
        name: 'Priya',
        email: 'priya@gmail.com',
        plainPassword: 'priya123',
        role: 'User/Requester',
        vendorId: null
      },
      {
        name: 'Ram',
        email: 'ram@gmail.com',
        plainPassword: 'ram123',
        role: 'Vendor',
        vendorId: 'VEN-1007',
        companyName: 'Ram Enterprises'
      }
    ];

    for (const acc of defaultAccounts) {
      // 1. If MongoDB is connected, seed in MongoDB Atlas
      if (isMongoConnected()) {
        try {
          const existingUser = await User.findOne({ email: acc.email.toLowerCase() });
          if (!existingUser) {
            const hashedPassword = await bcrypt.hash(acc.plainPassword, 10);
            await User.create({
              name: acc.name,
              email: acc.email.toLowerCase(),
              password: hashedPassword,
              role: acc.role,
              vendorId: acc.vendorId
            });
            console.log(`[MongoDB Seed] Created test account in Atlas: ${acc.email} (${acc.role})`);
          } else {
            // Verify and sync password to match required credentials
            const isMatch = await bcrypt.compare(acc.plainPassword, existingUser.password);
            if (!isMatch) {
              existingUser.password = await bcrypt.hash(acc.plainPassword, 10);
              await existingUser.save();
              console.log(`[MongoDB Seed] Updated password for: ${acc.email}`);
            }
          }
        } catch (mErr) {
          console.warn('[MongoDB Seed Warning]:', mErr.message);
        }
      }

      // 2. Sync with relational SQLite/MySQL users table for foreign-key consistency
      try {
        const [rows] = await pool.query(
          'SELECT id, password FROM users WHERE LOWER(email) = ? LIMIT 1',
          [acc.email.toLowerCase()]
        );
        let sqlUserId;
        const hashedPassword = await bcrypt.hash(acc.plainPassword, 10);

        if (rows.length === 0) {
          const [result] = await pool.query(
            'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
            [acc.name, acc.email.toLowerCase(), hashedPassword, acc.role]
          );
          sqlUserId = result.insertId;
        } else {
          sqlUserId = rows[0].id;
          // Update password so admin123, priya123, ram123 always work reliably
          await pool.query(
            'UPDATE users SET password = ?, name = ?, role = ? WHERE id = ?',
            [hashedPassword, acc.name, acc.role, sqlUserId]
          );
        }

        // If Vendor, also ensure entry in vendors table
        if (acc.role === 'Vendor' && acc.vendorId) {
          const [vRows] = await pool.query(
            'SELECT id FROM vendors WHERE LOWER(email) = ? OR vendor_id = ? LIMIT 1',
            [acc.email.toLowerCase(), acc.vendorId]
          );
          if (vRows.length === 0) {
            await pool.query(
              `INSERT INTO vendors 
                (vendor_id, vendor_name, contact_person, email, phone, address, city, state, product_categories, business_registration_number, description, status) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                acc.vendorId,
                acc.companyName || acc.name,
                acc.name,
                acc.email.toLowerCase(),
                '9876543210',
                'Technology Park, Industrial Area',
                'Coimbatore',
                'Tamil Nadu',
                'Computer Accessories',
                'REG-RAM-2026',
                'Authorized Computer Accessories Supplier',
                'Active'
              ]
            );
          }
        }
      } catch (sqlErr) {
        console.warn(`[SQL Sync Notice] Could not sync user ${acc.email} to SQL tables:`, sqlErr.message);
      }
    }
  } catch (err) {
    console.error('[MongoDB Seed Error]:', err.message);
  }
}

/**
 * Connect to MongoDB Atlas
 */
async function connectMongoDB() {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri || !mongoUri.trim()) {
    console.warn('==================================================================');
    console.warn('[MongoDB Notice] MONGO_URI environment variable is not defined.');
    console.warn('Authentication is running in fallback mode.');
    console.warn('To enable persistent cloud database authentication:');
    console.warn('  Add MONGO_URI=mongodb+srv://... in your Render Environment Variables');
    console.warn('==================================================================');
    // Still seed relational tables for offline testing
    await seedDefaultAccounts();
    return false;
  }

  try {
    // Configure mongoose connection
    await mongoose.connect(mongoUri.trim(), {
      dbName: 'VEPRS',
      serverSelectionTimeoutMS: 8000
    });

    isConnected = true;
    console.log('MongoDB connected successfully');

    // Seed test accounts in MongoDB Atlas & sync SQL
    await seedDefaultAccounts();
    return true;
  } catch (err) {
    isConnected = false;
    console.error('==================================================================');
    console.error('[MongoDB Error] Could not connect to MongoDB Atlas!');
    console.error('Error message:', err.message);
    console.error('Please verify your MONGO_URI string, credentials, and Network Access (0.0.0.0/0).');
    console.error('==================================================================');
    await seedDefaultAccounts();
    return false;
  }
}

module.exports = {
  connectMongoDB,
  isMongoConnected,
  seedDefaultAccounts
};
