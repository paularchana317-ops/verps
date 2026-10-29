const { pool } = require('../config/db');
const { isMongoConnected } = require('../config/mongodb');
const Feedback = require('../models/Feedback');

/**
 * Generate Next Unique Feedback ID (e.g. FB-1001, FB-1002, ...)
 * @param {object} connection - MySQL/SQLite connection or pool
 * @returns {Promise<string>}
 */
async function generateFeedbackId(connection) {
  const [rows] = await connection.query(
    'SELECT feedback_id FROM feedback ORDER BY id DESC LIMIT 1'
  );

  let nextSeq = 1001;
  if (rows.length > 0 && rows[0].feedback_id) {
    const match = rows[0].feedback_id.match(/FB-(\d+)/i);
    if (match && match[1]) {
      const currentNumber = parseInt(match[1], 10);
      if (!isNaN(currentNumber)) {
        nextSeq = Math.max(nextSeq, currentNumber + 1);
      }
    }
  }

  return `FB-${nextSeq}`;
}

/**
 * SCRUM-31: Submit Feedback
 * Allows authenticated users (Requesters / Admins) to submit ratings and feedback for vendors or orders.
 */
async function submitFeedback(req, res) {
  let connection;
  try {
    const userId = req.user.id;
    const userName = req.user.name || 'Anonymous Evaluator';
    const userEmail = (req.user.email || '').toLowerCase().trim();
    const userRole = req.user.role;

    const {
      vendorId,
      orderId,
      rating,
      comments,
      category
    } = req.body;

    // 1. Validate vendor selection
    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: 'Vendor selection is required.'
      });
    }

    // 2. Validate rating (mandatory integer 1 to 5)
    if (rating === undefined || rating === null || rating === '') {
      return res.status(400).json({
        success: false,
        message: 'Rating is required.'
      });
    }

    const parsedRating = parseInt(rating, 10);
    if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5 || parsedRating !== Number(rating)) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be an integer between 1 and 5.'
      });
    }

    // 3. Validate comments
    if (!comments || !comments.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Comments / feedback remarks are required.'
      });
    }

    // 4. Verify vendor existence in database
    const [vendorRows] = await pool.query(
      'SELECT id, vendor_id, vendor_name, email FROM vendors WHERE id = ? OR vendor_id = ? LIMIT 1',
      [vendorId, vendorId]
    );

    if (vendorRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Selected vendor does not exist in the database.'
      });
    }

    const vendor = vendorRows[0];

    // 5. Prevent vendors from reviewing their own company
    if (userRole === 'Vendor' && vendor.email.toLowerCase() === userEmail) {
      return res.status(400).json({
        success: false,
        message: 'Vendors cannot submit feedback for their own organization.'
      });
    }

    // 6. Optional Order validation / lookup
    let orderNumericId = null;
    let orderCode = null;
    if (orderId) {
      const [orderRows] = await pool.query(
        'SELECT id, order_id, vendor_id FROM orders WHERE id = ? OR order_id = ? LIMIT 1',
        [orderId, orderId]
      );
      if (orderRows.length > 0) {
        orderNumericId = orderRows[0].id;
        orderCode = orderRows[0].order_id;
      }
    }

    const finalCategory = (category && category.trim()) ? category.trim() : 'General';

    // 7. Begin transaction
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const feedbackId = await generateFeedbackId(connection);

    // 8. Insert feedback record
    const [result] = await connection.query(
      `INSERT INTO feedback 
        (feedback_id, user_id, user_name, user_email, vendor_id, vendor_code, vendor_name, order_id, order_code, rating, comments, category, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        feedbackId,
        userId,
        userName,
        userEmail,
        vendor.id,
        vendor.vendor_id,
        vendor.vendor_name,
        orderNumericId,
        orderCode,
        parsedRating,
        comments.trim(),
        finalCategory,
        'Active'
      ]
    );

    // 9. Update average rating in vendors table
    try {
      const [ratingStats] = await connection.query(
        'SELECT AVG(rating) as avg_rating FROM feedback WHERE vendor_id = ? AND status = "Active"',
        [vendor.id]
      );
      if (ratingStats.length > 0 && ratingStats[0].avg_rating !== null) {
        const newRating = Math.round(parseFloat(ratingStats[0].avg_rating) * 10) / 10;
        await connection.query(
          'UPDATE vendors SET rating = ? WHERE id = ?',
          [newRating, vendor.id]
        );
      }
    } catch (rErr) {
      console.warn('[Vendor Rating Update Warning]:', rErr.message);
    }

    await connection.commit();
    connection.release();

    // 10. Sync with MongoDB Atlas if connected
    if (isMongoConnected()) {
      try {
        await Feedback.create({
          feedback_id: feedbackId,
          user_id: String(userId),
          user_name: userName,
          user_email: userEmail,
          vendor_id: String(vendor.id),
          vendor_code: vendor.vendor_id,
          vendor_name: vendor.vendor_name,
          order_id: orderNumericId ? String(orderNumericId) : null,
          order_code: orderCode,
          rating: parsedRating,
          comments: comments.trim(),
          category: finalCategory,
          status: 'Active'
        });
      } catch (mErr) {
        console.warn('[MongoDB Feedback Sync Warning]:', mErr.message);
      }
    }

    return res.status(201).json({
      success: true,
      message: `Feedback ${feedbackId} submitted successfully. Thank you for your review!`,
      feedbackId,
      feedback: {
        id: result.insertId,
        feedbackId,
        vendorId: vendor.vendor_id,
        vendorName: vendor.vendor_name,
        orderCode,
        rating: parsedRating,
        comments: comments.trim(),
        category: finalCategory
      }
    });

  } catch (err) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error('[Submit Feedback Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while submitting feedback.'
    });
  }
}

/**
 * SCRUM-32: View Feedback
 * Retrieves feedback with role-based visibility:
 * - Vendors see feedback specifically addressed to their company.
 * - Requesters & Admins see all feedback across vendors with optional filtering.
 */
async function getAllFeedback(req, res) {
  try {
    const userRole = req.user.role;
    const userEmail = (req.user.email || '').toLowerCase().trim();
    const { vendorId, rating, category, orderId } = req.query;

    let sql = `
      SELECT 
        f.id,
        f.feedback_id,
        f.user_id,
        f.user_name,
        f.user_email,
        f.vendor_id,
        f.vendor_code,
        f.vendor_name,
        f.order_id,
        f.order_code,
        f.rating,
        f.comments,
        f.category,
        f.status,
        DATE_FORMAT(f.created_at, '%d-%m-%Y') AS feedback_date,
        f.created_at
      FROM feedback f
      WHERE f.status = 'Active'
    `;
    const params = [];

    // Role-based scoping for Vendor
    if (userRole === 'Vendor') {
      const [vRows] = await pool.query(
        'SELECT id, vendor_id FROM vendors WHERE LOWER(email) = ? LIMIT 1',
        [userEmail]
      );
      if (vRows.length === 0) {
        return res.status(200).json({
          success: true,
          count: 0,
          feedbacks: []
        });
      }
      sql += ' AND (f.vendor_id = ? OR f.vendor_code = ?)';
      params.push(vRows[0].id, vRows[0].vendor_id);
    }

    // Optional query filters
    if (vendorId) {
      sql += ' AND (f.vendor_id = ? OR f.vendor_code = ?)';
      params.push(vendorId, vendorId);
    }

    if (rating) {
      const parsedR = parseInt(rating, 10);
      if (!isNaN(parsedR)) {
        sql += ' AND f.rating = ?';
        params.push(parsedR);
      }
    }

    if (category && category.trim()) {
      sql += ' AND f.category = ?';
      params.push(category.trim());
    }

    if (orderId && orderId.trim()) {
      sql += ' AND (f.order_id = ? OR f.order_code = ?)';
      params.push(orderId.trim(), orderId.trim());
    }

    sql += ' ORDER BY f.id DESC';

    const [rows] = await pool.query(sql, params);

    return res.status(200).json({
      success: true,
      count: rows.length,
      feedbacks: rows
    });

  } catch (err) {
    console.error('[Get All Feedback Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve feedback.'
    });
  }
}

/**
 * SCRUM-32: View Vendor Feedback Summary
 * Retrieves detailed reviews and star distribution stats for a specific vendor.
 */
async function getVendorFeedbackSummary(req, res) {
  try {
    const { vendorId } = req.params;

    // Look up vendor
    const [vRows] = await pool.query(
      'SELECT id, vendor_id, vendor_name, email, rating FROM vendors WHERE id = ? OR vendor_id = ? LIMIT 1',
      [vendorId, vendorId]
    );

    if (vRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found.'
      });
    }

    const vendor = vRows[0];

    // Fetch all active feedback for this vendor
    const [feedbacks] = await pool.query(
      `SELECT 
        f.id,
        f.feedback_id,
        f.user_name,
        f.vendor_id,
        f.vendor_code,
        f.vendor_name,
        f.order_code,
        f.rating,
        f.comments,
        f.category,
        DATE_FORMAT(f.created_at, '%d-%m-%Y') AS feedback_date,
        f.created_at
       FROM feedback f
       WHERE (f.vendor_id = ? OR f.vendor_code = ?) AND f.status = 'Active'
       ORDER BY f.id DESC`,
      [vendor.id, vendor.vendor_id]
    );

    // Compute distribution metrics
    const totalReviews = feedbacks.length;
    let sumRating = 0;
    const starCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

    feedbacks.forEach(fb => {
      sumRating += fb.rating;
      if (starCounts[fb.rating] !== undefined) {
        starCounts[fb.rating]++;
      }
    });

    const averageRating = totalReviews > 0 ? (sumRating / totalReviews).toFixed(1) : '0.0';

    return res.status(200).json({
      success: true,
      vendor: {
        id: vendor.id,
        vendorId: vendor.vendor_id,
        vendorName: vendor.vendor_name,
        storedRating: vendor.rating
      },
      summary: {
        totalReviews,
        averageRating: parseFloat(averageRating),
        starCounts
      },
      feedbacks
    });

  } catch (err) {
    console.error('[Get Vendor Feedback Summary Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve vendor feedback summary.'
    });
  }
}

/**
 * SCRUM-32: View My Submitted Feedback
 * Retrieves feedback authored by the authenticated user.
 */
async function getMyFeedback(req, res) {
  try {
    const userId = req.user.id;
    const userEmail = (req.user.email || '').toLowerCase().trim();

    const [rows] = await pool.query(
      `SELECT 
        f.id,
        f.feedback_id,
        f.vendor_id,
        f.vendor_code,
        f.vendor_name,
        f.order_id,
        f.order_code,
        f.rating,
        f.comments,
        f.category,
        f.status,
        DATE_FORMAT(f.created_at, '%d-%m-%Y') AS feedback_date,
        f.created_at
       FROM feedback f
       WHERE f.user_id = ? OR LOWER(f.user_email) = ?
       ORDER BY f.id DESC`,
      [userId, userEmail]
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      feedbacks: rows
    });

  } catch (err) {
    console.error('[Get My Feedback Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve your feedback.'
    });
  }
}

/**
 * Helper: Retrieve Feedback Sources
 * Fetches active vendors and user orders to populate the feedback submission dropdowns.
 */
async function getFeedbackSources(req, res) {
  try {
    const userId = req.user.id;
    const userEmail = (req.user.email || '').toLowerCase().trim();

    // 1. Fetch active certified vendors
    const [vendors] = await pool.query(
      `SELECT id, vendor_id, vendor_name, email, product_categories, rating 
       FROM vendors 
       WHERE status = 'Active' 
       ORDER BY vendor_name ASC`
    );

    // 2. Fetch user's orders (if any)
    const [orders] = await pool.query(
      `SELECT id, order_id, vendor_id, vendor_code, vendor_name, product_name, status, total_price 
       FROM orders 
       WHERE user_id = ? OR LOWER(user_email) = ?
       ORDER BY id DESC`,
      [userId, userEmail]
    );

    return res.status(200).json({
      success: true,
      vendors,
      orders
    });

  } catch (err) {
    console.error('[Get Feedback Sources Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve feedback options.'
    });
  }
}

module.exports = {
  generateFeedbackId,
  submitFeedback,
  getAllFeedback,
  getVendorFeedbackSummary,
  getMyFeedback,
  getFeedbackSources
};
