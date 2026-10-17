const { pool } = require('../config/db');
const { isMongoConnected } = require('../config/mongodb');
const Order = require('../models/Order');

// Valid status lifecycle for VEPRS
const VALID_ORDER_STATUSES = ['Placed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

/**
 * Generate Next Unique Order ID (e.g. ORD-1001, ORD-1002, ...)
 * @param {object} connection - MySQL/SQLite connection or pool
 * @returns {Promise<string>}
 */
async function generateOrderId(connection) {
  const [rows] = await connection.query(
    'SELECT order_id FROM orders ORDER BY id DESC LIMIT 1'
  );

  let nextSeq = 1001;
  if (rows.length > 0 && rows[0].order_id) {
    const match = rows[0].order_id.match(/ORD-(\d+)/i);
    if (match && match[1]) {
      const currentNumber = parseInt(match[1], 10);
      if (!isNaN(currentNumber)) {
        nextSeq = Math.max(nextSeq, currentNumber + 1);
      }
    }
  }

  return `ORD-${nextSeq}`;
}

/**
 * SCRUM-29: Create Order (Authenticated User / Requester or Admin)
 * Creates purchase order from approved purchase request, vendor quotation, or recommended vendor.
 */
async function createOrder(req, res) {
  let connection;
  try {
    const userId = req.user.id;
    const userName = req.user.name || 'Requester';
    const userEmail = (req.user.email || '').toLowerCase().trim();

    const {
      vendorId,
      productName,
      productCategory,
      quantity,
      unitPrice,
      deliveryAddress,
      contactPhone,
      notes,
      purchaseRequestId,
      quotationId
    } = req.body;

    // 1. Validation: Required fields
    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: 'Vendor selection is required.'
      });
    }

    if (!productName || !productName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Product Name is required.'
      });
    }

    if (quantity === undefined || quantity === null || quantity === '') {
      return res.status(400).json({
        success: false,
        message: 'Quantity is required.'
      });
    }

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be a positive integer greater than 0.'
      });
    }

    if (unitPrice === undefined || unitPrice === null || unitPrice === '') {
      return res.status(400).json({
        success: false,
        message: 'Unit Price is required.'
      });
    }

    const parsedUnitPrice = parseFloat(unitPrice);
    if (isNaN(parsedUnitPrice) || parsedUnitPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Unit Price must be a positive number greater than 0.'
      });
    }

    if (!deliveryAddress || !deliveryAddress.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Delivery Address is required.'
      });
    }

    // Accurate total price calculation
    const calculatedTotalPrice = Math.round(parsedQty * parsedUnitPrice * 100) / 100;

    // 2. Fetch selected Vendor details from database
    const [vendorRows] = await pool.query(
      'SELECT id, vendor_id, vendor_name, email, phone, product_categories, status FROM vendors WHERE id = ? OR vendor_id = ? LIMIT 1',
      [vendorId, vendorId]
    );

    if (vendorRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Selected vendor does not exist in the database.'
      });
    }

    const vendor = vendorRows[0];
    const finalCategory = (productCategory && productCategory.trim()) 
      ? productCategory.trim() 
      : (vendor.product_categories || 'Computer Accessories');

    // 3. Optional Source Link: Purchase Request lookup
    let prNumericId = null;
    let prCode = null;
    if (purchaseRequestId) {
      const [prRows] = await pool.query(
        'SELECT id, request_id, product_name, quantity, status FROM purchase_requests WHERE id = ? OR request_id = ? LIMIT 1',
        [purchaseRequestId, purchaseRequestId]
      );
      if (prRows.length > 0) {
        prNumericId = prRows[0].id;
        prCode = prRows[0].request_id;
      }
    }

    // 4. Optional Source Link: Quotation lookup
    let quoNumericId = null;
    let quoCode = null;
    if (quotationId) {
      const [quoRows] = await pool.query(
        'SELECT id, quotation_id, vendor_id, unit_price, status FROM quotations WHERE id = ? OR quotation_id = ? LIMIT 1',
        [quotationId, quotationId]
      );
      if (quoRows.length > 0) {
        quoNumericId = quoRows[0].id;
        quoCode = quoRows[0].quotation_id;
      }
    }

    // 5. Duplicate order check: Prevent duplicate order for identical active quotation
    if (quoNumericId) {
      const [existingOrderWithQuo] = await pool.query(
        'SELECT id, order_id FROM orders WHERE quotation_id = ? AND status != "Cancelled" LIMIT 1',
        [quoNumericId]
      );
      if (existingOrderWithQuo.length > 0) {
        return res.status(400).json({
          success: false,
          message: `An order (${existingOrderWithQuo[0].order_id}) has already been placed for this quotation.`
        });
      }
    }

    // 6. Begin transaction
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const orderId = await generateOrderId(connection);

    // 7. Insert order into relational database
    const [result] = await connection.query(
      `INSERT INTO orders 
        (order_id, user_id, user_name, user_email, vendor_id, vendor_code, vendor_name, purchase_request_id, purchase_request_code, quotation_id, quotation_code, product_name, product_category, quantity, unit_price, total_price, delivery_address, contact_phone, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        userId,
        userName,
        userEmail,
        vendor.id,
        vendor.vendor_id,
        vendor.vendor_name,
        prNumericId,
        prCode,
        quoNumericId,
        quoCode,
        productName.trim(),
        finalCategory,
        parsedQty,
        parsedUnitPrice,
        calculatedTotalPrice,
        deliveryAddress.trim(),
        contactPhone ? contactPhone.trim() : (vendor.phone || null),
        notes ? notes.trim() : null,
        'Placed'
      ]
    );

    // 8. Update linked purchase_request status if applicable
    if (prNumericId) {
      await connection.query(
        'UPDATE purchase_requests SET status = "Order Placed" WHERE id = ?',
        [prNumericId]
      );
    }

    // 9. Update linked quotation status if applicable
    if (quoNumericId) {
      await connection.query(
        'UPDATE quotations SET status = "Awarded" WHERE id = ?',
        [quoNumericId]
      );
    }

    await connection.commit();
    connection.release();

    // 10. Sync with MongoDB Atlas if connected
    if (isMongoConnected()) {
      try {
        await Order.create({
          order_id: orderId,
          user_id: String(userId),
          user_name: userName,
          user_email: userEmail,
          vendor_id: String(vendor.id),
          vendor_code: vendor.vendor_id,
          vendor_name: vendor.vendor_name,
          purchase_request_id: prNumericId ? String(prNumericId) : null,
          purchase_request_code: prCode,
          quotation_id: quoNumericId ? String(quoNumericId) : null,
          quotation_code: quoCode,
          product_name: productName.trim(),
          product_category: finalCategory,
          quantity: parsedQty,
          unit_price: parsedUnitPrice,
          total_price: calculatedTotalPrice,
          delivery_address: deliveryAddress.trim(),
          contact_phone: contactPhone ? contactPhone.trim() : null,
          notes: notes ? notes.trim() : null,
          status: 'Placed',
          status_history: [
            {
              status: 'Placed',
              updated_by: userName,
              updated_by_role: req.user.role || 'User/Requester',
              timestamp: new Date(),
              comment: 'Order placed by requester'
            }
          ]
        });
      } catch (mErr) {
        console.warn('[MongoDB Order Sync Warning]:', mErr.message);
      }
    }

    return res.status(201).json({
      success: true,
      message: `Purchase order ${orderId} created successfully.`,
      orderId,
      order: {
        id: result.insertId,
        orderId,
        vendorId: vendor.vendor_id,
        vendorName: vendor.vendor_name,
        productName: productName.trim(),
        productCategory: finalCategory,
        quantity: parsedQty,
        unitPrice: parsedUnitPrice,
        totalPrice: calculatedTotalPrice,
        deliveryAddress: deliveryAddress.trim(),
        status: 'Placed'
      }
    });

  } catch (err) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error('[Create Order Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while creating order.'
    });
  }
}

/**
 * SCRUM-30: Get User Orders (Protected: User/Requester)
 * Strictly scopes to authenticated user's own orders.
 */
async function getMyOrders(req, res) {
  try {
    const userId = req.user.id;
    const userEmail = (req.user.email || '').toLowerCase().trim();

    const [rows] = await pool.query(
      `SELECT 
        o.id,
        o.order_id,
        o.user_id,
        o.user_name,
        o.user_email,
        o.vendor_id,
        o.vendor_code,
        o.vendor_name,
        o.purchase_request_id,
        o.purchase_request_code,
        o.quotation_id,
        o.quotation_code,
        o.product_name,
        o.product_category,
        o.quantity,
        o.unit_price,
        o.total_price,
        o.delivery_address,
        o.contact_phone,
        o.notes,
        o.status,
        DATE_FORMAT(o.created_at, '%d-%m-%Y') AS order_date,
        o.created_at,
        o.updated_at
       FROM orders o
       WHERE o.user_id = ? OR LOWER(o.user_email) = ?
       ORDER BY o.id DESC`,
      [userId, userEmail]
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      orders: rows
    });
  } catch (err) {
    console.error('[Get My Orders Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve orders.'
    });
  }
}

/**
 * SCRUM-30 & SCRUM-44: Get Vendor Orders (Protected: Vendor)
 * Retrieves orders assigned to the logged-in vendor's company.
 */
async function getVendorOrders(req, res) {
  try {
    const vendorEmail = (req.user.email || '').toLowerCase().trim();

    // Look up vendor record
    const [vRows] = await pool.query(
      'SELECT id, vendor_id FROM vendors WHERE LOWER(email) = ? LIMIT 1',
      [vendorEmail]
    );

    if (vRows.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        orders: []
      });
    }

    const vendor = vRows[0];

    const [rows] = await pool.query(
      `SELECT 
        o.id,
        o.order_id,
        o.user_id,
        o.user_name,
        o.user_email,
        o.vendor_id,
        o.vendor_code,
        o.vendor_name,
        o.purchase_request_id,
        o.purchase_request_code,
        o.quotation_id,
        o.quotation_code,
        o.product_name,
        o.product_category,
        o.quantity,
        o.unit_price,
        o.total_price,
        o.delivery_address,
        o.contact_phone,
        o.notes,
        o.status,
        DATE_FORMAT(o.created_at, '%d-%m-%Y') AS order_date,
        o.created_at,
        o.updated_at
       FROM orders o
       WHERE o.vendor_id = ? OR o.vendor_code = ?
       ORDER BY o.id DESC`,
      [vendor.id, vendor.vendor_id]
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      orders: rows
    });
  } catch (err) {
    console.error('[Get Vendor Orders Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve vendor orders.'
    });
  }
}

/**
 * SCRUM-30 & SCRUM-44: Get All Orders (Protected: Admin)
 * Retrieves all procurement orders across the organization.
 */
async function getAllOrders(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT 
        o.id,
        o.order_id,
        o.user_id,
        o.user_name,
        o.user_email,
        o.vendor_id,
        o.vendor_code,
        o.vendor_name,
        o.purchase_request_id,
        o.purchase_request_code,
        o.quotation_id,
        o.quotation_code,
        o.product_name,
        o.product_category,
        o.quantity,
        o.unit_price,
        o.total_price,
        o.delivery_address,
        o.contact_phone,
        o.notes,
        o.status,
        DATE_FORMAT(o.created_at, '%d-%m-%Y') AS order_date,
        o.created_at,
        o.updated_at
       FROM orders o
       ORDER BY o.id DESC`
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      orders: rows
    });
  } catch (err) {
    console.error('[Get All Orders Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve all orders.'
    });
  }
}

/**
 * SCRUM-30: Get Single Order By ID with Cross-User Security Check
 */
async function getOrderById(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT 
        o.id,
        o.order_id,
        o.user_id,
        o.user_name,
        o.user_email,
        o.vendor_id,
        o.vendor_code,
        o.vendor_name,
        o.purchase_request_id,
        o.purchase_request_code,
        o.quotation_id,
        o.quotation_code,
        o.product_name,
        o.product_category,
        o.quantity,
        o.unit_price,
        o.total_price,
        o.delivery_address,
        o.contact_phone,
        o.notes,
        o.status,
        DATE_FORMAT(o.created_at, '%d-%m-%Y') AS order_date,
        o.created_at,
        o.updated_at
       FROM orders o
       WHERE o.id = ? OR o.order_id = ?
       LIMIT 1`,
      [id, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    const order = rows[0];
    const userRole = req.user.role;
    const userEmail = (req.user.email || '').toLowerCase().trim();
    const userId = String(req.user.id);

    // Cross-user / cross-tenant security enforcement:
    if (userRole === 'User/Requester' || userRole === 'Requester' || userRole === 'User') {
      if (String(order.user_id) !== userId && order.user_email.toLowerCase() !== userEmail) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: You are not authorized to view this order.'
        });
      }
    } else if (userRole === 'Vendor') {
      const [vRows] = await pool.query(
        'SELECT id, vendor_id FROM vendors WHERE LOWER(email) = ? LIMIT 1',
        [userEmail]
      );
      if (vRows.length === 0 || (vRows[0].id !== order.vendor_id && vRows[0].vendor_id !== order.vendor_code)) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: You are not authorized to view this order.'
        });
      }
    }

    return res.status(200).json({
      success: true,
      order
    });
  } catch (err) {
    console.error('[Get Order By ID Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve order details.'
    });
  }
}

/**
 * SCRUM-44: Update Order Status
 * Enforces valid role-based status transitions:
 * - User/Requester: Can only cancel their own 'Placed' orders ('Placed' -> 'Cancelled').
 * - Vendor: Can update fulfillment status ('Placed' -> 'Processing' -> 'Shipped' -> 'Delivered').
 * - Admin: Can transition between valid states or cancel.
 */
async function updateOrderStatus(req, res) {
  try {
    const { id } = req.params;
    const { status: newStatus, comment } = req.body;

    if (!newStatus || !VALID_ORDER_STATUSES.includes(newStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid order status. Allowed statuses: ${VALID_ORDER_STATUSES.join(', ')}`
      });
    }

    // 1. Fetch current order
    const [rows] = await pool.query(
      'SELECT id, order_id, user_id, user_email, vendor_id, vendor_code, status FROM orders WHERE id = ? OR order_id = ? LIMIT 1',
      [id, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    const order = rows[0];
    const currentStatus = order.status;
    const userRole = req.user.role;
    const userEmail = (req.user.email || '').toLowerCase().trim();
    const userId = String(req.user.id);

    // 2. Prevent modifications on terminal states
    if (currentStatus === 'Delivered') {
      return res.status(400).json({
        success: false,
        message: 'This order has already been Delivered and cannot be modified.'
      });
    }

    if (currentStatus === 'Cancelled') {
      return res.status(400).json({
        success: false,
        message: 'This order has been Cancelled and cannot be reopened.'
      });
    }

    // 3. Enforce Role & Transition Rules
    const isUser = userRole === 'User/Requester' || userRole === 'Requester' || userRole === 'User';
    const isVendor = userRole === 'Vendor';
    const isAdmin = userRole === 'Admin';

    if (isUser) {
      // Must be owner
      if (String(order.user_id) !== userId && order.user_email.toLowerCase() !== userEmail) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: You cannot update another user\'s order.'
        });
      }

      // Requesters can only cancel their order
      if (newStatus !== 'Cancelled') {
        return res.status(403).json({
          success: false,
          message: 'Requesters can only cancel placed orders; fulfillment statuses are updated by suppliers or administrators.'
        });
      }

      // Can only cancel if current status is 'Placed'
      if (currentStatus !== 'Placed') {
        return res.status(400).json({
          success: false,
          message: `Order is already '${currentStatus}' and cannot be cancelled directly by requester. Please contact procurement.`
        });
      }
    } else if (isVendor) {
      // Verify vendor ownership
      const [vRows] = await pool.query(
        'SELECT id, vendor_id FROM vendors WHERE LOWER(email) = ? LIMIT 1',
        [userEmail]
      );
      if (vRows.length === 0 || (vRows[0].id !== order.vendor_id && vRows[0].vendor_id !== order.vendor_code)) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: You can only update orders assigned to your company.'
        });
      }

      // Valid Vendor transitions: Placed -> Processing -> Shipped -> Delivered
      const validVendorNext = {
        'Placed': ['Processing', 'Cancelled'],
        'Processing': ['Shipped'],
        'Shipped': ['Delivered']
      };

      const allowedNext = validVendorNext[currentStatus] || [];
      if (!allowedNext.includes(newStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid transition for vendor: cannot move from '${currentStatus}' to '${newStatus}'. Allowed: ${allowedNext.join(', ')}`
        });
      }
    } else if (isAdmin) {
      // Admin transitions:
      const validAdminNext = {
        'Placed': ['Processing', 'Cancelled'],
        'Processing': ['Shipped', 'Cancelled'],
        'Shipped': ['Delivered', 'Cancelled']
      };

      const allowedNext = validAdminNext[currentStatus] || [];
      if (!allowedNext.includes(newStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status transition: cannot move from '${currentStatus}' to '${newStatus}'.`
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'Access Denied'
      });
    }

    // 4. Update order status in SQL
    await pool.query(
      'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newStatus, order.id]
    );

    // 5. Sync with MongoDB Atlas if connected
    if (isMongoConnected()) {
      try {
        await Order.findOneAndUpdate(
          { order_id: order.order_id },
          {
            $set: {
              status: newStatus,
              updated_at: new Date()
            },
            $push: {
              status_history: {
                status: newStatus,
                updated_by: req.user.name || 'User',
                updated_by_role: userRole,
                timestamp: new Date(),
                comment: comment ? comment.trim() : `Status changed from ${currentStatus} to ${newStatus}`
              }
            }
          }
        );
      } catch (mErr) {
        console.warn('[MongoDB Order Status Sync Warning]:', mErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Order ${order.order_id} status updated to '${newStatus}'.`,
      orderId: order.order_id,
      previousStatus: currentStatus,
      currentStatus: newStatus
    });

  } catch (err) {
    console.error('[Update Order Status Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while updating order status.'
    });
  }
}

/**
 * Helper: Retrieve Order Sources (Available Approved Requests, Quotations, and Recommended Vendors)
 */
async function getOrderSources(req, res) {
  try {
    const userId = req.user.id;
    const userEmail = (req.user.email || '').toLowerCase().trim();

    // 1. Fetch user's purchase requests
    const [requests] = await pool.query(
      `SELECT id, request_id, product_name, product_category, quantity, required_delivery_date, status 
       FROM purchase_requests 
       WHERE (user_id = ? OR user_id = (SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1))
         AND status != 'Order Placed'
       ORDER BY id DESC`,
      [userId, userEmail]
    );

    // 2. Fetch available quotations
    const [quotations] = await pool.query(
      `SELECT 
        q.id,
        q.quotation_id,
        q.purchase_request_id,
        q.vendor_id,
        v.vendor_id AS vendor_code,
        v.vendor_name,
        q.product_name,
        q.quantity,
        q.unit_price,
        q.total_price,
        q.delivery_time,
        q.status
       FROM quotations q
       JOIN vendors v ON q.vendor_id = v.id
       WHERE q.status = 'Submitted'
       ORDER BY q.id DESC`
    );

    // 3. Fetch active certified vendors
    const [vendors] = await pool.query(
      `SELECT id, vendor_id, vendor_name, email, phone, address, city, state, product_categories, status 
       FROM vendors 
       WHERE status = 'Active' 
       ORDER BY vendor_name ASC`
    );

    // 4. Fetch top recommendations if available
    const [recommendations] = await pool.query(
      `SELECT r.recommendation_id, r.vendor_id, r.vendor_code, r.vendor_name, r.overall_score, r.rank, r.product_categories 
       FROM recommendations r 
       ORDER BY r.rank ASC LIMIT 3`
    );

    return res.status(200).json({
      success: true,
      requests,
      quotations,
      vendors,
      recommendations
    });
  } catch (err) {
    console.error('[Get Order Sources Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve order source options.'
    });
  }
}

module.exports = {
  generateOrderId,
  createOrder,
  getMyOrders,
  getVendorOrders,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  getOrderSources
};
