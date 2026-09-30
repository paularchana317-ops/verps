const { pool } = require('../config/db');

// Approved Product Category & Products List for VEPRS
const APPROVED_PRODUCT_CATEGORY = 'Computer Accessories';
const APPROVED_PRODUCTS = [
  'Keyboard',
  'Mouse',
  'Monitor',
  'Webcam',
  'Headset',
  'USB Hub',
  'External Hard Drive',
  'SSD',
  'RAM',
  'Graphics Card',
  'Laptop Stand',
  'Printer',
  'HDMI Cable',
  'USB Cable',
  'Power Adapter'
];

/**
 * Generate Next Unique Request ID (e.g. REQ-1001, REQ-1002, ...)
 * @param {object} connection - MySQL connection
 * @returns {Promise<string>}
 */
async function generateRequestId(connection) {
  const [rows] = await connection.query(
    'SELECT request_id FROM purchase_requests ORDER BY id DESC LIMIT 1'
  );

  let nextSeq = 1001;
  if (rows.length > 0 && rows[0].request_id) {
    const match = rows[0].request_id.match(/REQ-(\d+)/i);
    if (match && match[1]) {
      const currentNumber = parseInt(match[1], 10);
      if (!isNaN(currentNumber)) {
        nextSeq = Math.max(nextSeq, currentNumber + 1);
      }
    }
  }

  return `REQ-${nextSeq}`;
}

/**
 * Submit a new purchase request (User / Requester role)
 * Strictly restricted to Computer Accessories category and approved product list.
 */
async function submitRequest(req, res) {
  let connection;
  try {
    const userId = req.user.id;
    const {
      productCategory,
      productName,
      quantity,
      requirements,
      requiredDeliveryDate,
      additionalNotes
    } = req.body;

    // 1. Validation - Category must strictly be "Computer Accessories"
    if (!productCategory || productCategory.trim() !== APPROVED_PRODUCT_CATEGORY) {
      return res.status(400).json({
        success: false,
        message: `Invalid Product Category. VEPRS strictly supports '${APPROVED_PRODUCT_CATEGORY}' only.`
      });
    }

    // 2. Validation - Product Name must strictly be one of the 15 approved computer accessories
    if (!productName || !APPROVED_PRODUCTS.includes(productName.trim())) {
      return res.status(400).json({
        success: false,
        message: `Invalid Product Name. Please select an approved Computer Accessory: ${APPROVED_PRODUCTS.join(', ')}.`
      });
    }

    if (quantity === undefined || quantity === null || quantity === '') {
      return res.status(400).json({
        success: false,
        message: 'Quantity is mandatory.'
      });
    }

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be a positive number greater than 0.'
      });
    }

    if (!requirements || !requirements.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Product Requirements are mandatory.'
      });
    }

    if (!requiredDeliveryDate || !requiredDeliveryDate.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Required Delivery Date is mandatory.'
      });
    }

    // Validate delivery date format
    const deliveryDateObj = new Date(requiredDeliveryDate);
    if (isNaN(deliveryDateObj.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Required Delivery Date.'
      });
    }

    // Format delivery date as YYYY-MM-DD for MySQL DATE type
    const formattedDeliveryDate = deliveryDateObj.toISOString().split('T')[0];

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 3. Generate Unique Request ID
    const requestId = await generateRequestId(connection);

    // 4. Insert Purchase Request
    const [result] = await connection.query(
      `INSERT INTO purchase_requests 
        (request_id, user_id, product_category, product_name, quantity, requirements, required_delivery_date, additional_notes, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        requestId,
        userId,
        APPROVED_PRODUCT_CATEGORY,
        productName.trim(),
        parsedQty,
        requirements.trim(),
        formattedDeliveryDate,
        additionalNotes ? additionalNotes.trim() : null,
        'Pending'
      ]
    );

    await connection.commit();
    connection.release();

    return res.status(201).json({
      success: true,
      message: 'Purchase request submitted successfully.',
      requestId: requestId,
      data: {
        id: result.insertId,
        requestId,
        productCategory: APPROVED_PRODUCT_CATEGORY,
        productName: productName.trim(),
        quantity: parsedQty,
        requirements: requirements.trim(),
        requiredDeliveryDate: formattedDeliveryDate,
        additionalNotes: additionalNotes ? additionalNotes.trim() : null,
        status: 'Pending'
      }
    });
  } catch (err) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error('[Submit Request Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while submitting purchase request.'
    });
  }
}

/**
 * Get all requests submitted by the logged-in user
 */
async function getMyRequests(req, res) {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT 
        id,
        request_id,
        user_id,
        product_category,
        product_name,
        quantity,
        requirements,
        DATE_FORMAT(required_delivery_date, '%d-%m-%Y') AS required_delivery_date,
        additional_notes,
        status,
        DATE_FORMAT(created_at, '%d-%m-%Y') AS request_date,
        created_at
       FROM purchase_requests 
       WHERE user_id = ? 
       ORDER BY id DESC`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      requests: rows
    });
  } catch (err) {
    console.error('[Get My Requests Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve purchase requests.'
    });
  }
}

/**
 * Get all purchase requests (Admin role)
 */
async function getAllRequests(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT 
        pr.id,
        pr.request_id,
        pr.product_category,
        pr.product_name,
        pr.quantity,
        pr.requirements,
        DATE_FORMAT(pr.required_delivery_date, '%d-%m-%Y') AS required_delivery_date,
        pr.additional_notes,
        pr.status,
        DATE_FORMAT(pr.created_at, '%d-%m-%Y') AS request_date,
        u.name AS requester_name,
        u.email AS requester_email
       FROM purchase_requests pr
       JOIN users u ON pr.user_id = u.id
       ORDER BY pr.id DESC`
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      requests: rows
    });
  } catch (err) {
    console.error('[Get All Requests Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve all purchase requests.'
    });
  }
}

/**
 * Get Single Purchase Request By ID
 */
async function getRequestById(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT 
        pr.id,
        pr.request_id,
        pr.product_category,
        pr.product_name,
        pr.quantity,
        pr.requirements,
        DATE_FORMAT(pr.required_delivery_date, '%d-%m-%Y') AS required_delivery_date,
        pr.required_delivery_date AS raw_delivery_date,
        pr.additional_notes,
        pr.status,
        DATE_FORMAT(pr.created_at, '%d-%m-%Y') AS request_date,
        u.name AS requester_name,
        u.email AS requester_email
       FROM purchase_requests pr
       JOIN users u ON pr.user_id = u.id
       WHERE pr.id = ? OR pr.request_id = ?
       LIMIT 1`,
      [id, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Purchase request not found.'
      });
    }

    return res.status(200).json({
      success: true,
      request: rows[0]
    });
  } catch (err) {
    console.error('[Get Request By ID Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve purchase request.'
    });
  }
}

module.exports = {
  APPROVED_PRODUCT_CATEGORY,
  APPROVED_PRODUCTS,
  submitRequest,
  getMyRequests,
  getAllRequests,
  getRequestById
};
