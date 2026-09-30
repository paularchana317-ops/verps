const { pool } = require('../config/db');

/**
 * Generate Next Unique Quotation Request ID (e.g. QR-1001, QR-1002, ...)
 * @param {object} connection - MySQL/SQLite connection or pool
 * @returns {Promise<string>}
 */
async function generateQuotationRequestId(connection) {
  const [rows] = await connection.query(
    'SELECT quotation_request_id FROM quotation_requests ORDER BY id DESC LIMIT 1'
  );

  let nextSeq = 1001;
  if (rows.length > 0 && rows[0].quotation_request_id) {
    const match = rows[0].quotation_request_id.match(/QR-(\d+)/i);
    if (match && match[1]) {
      const currentNumber = parseInt(match[1], 10);
      if (!isNaN(currentNumber)) {
        nextSeq = Math.max(nextSeq, currentNumber + 1);
      }
    }
  }

  return `QR-${nextSeq}`;
}

/**
 * Send Quotation Request to One or More Vendors (SCRUM-24 - Admin only)
 */
async function createQuotationRequests(req, res) {
  let connection;
  try {
    const {
      purchaseRequestId,
      vendorIds,
      requestedQuantity,
      requirements,
      requiredDeliveryDate,
      additionalMessage
    } = req.body;

    // 1. Validate inputs
    if (!purchaseRequestId) {
      return res.status(400).json({
        success: false,
        message: 'Purchase Request ID is required.'
      });
    }

    if (!vendorIds || !Array.isArray(vendorIds) || vendorIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please select at least one vendor to send the quotation request.'
      });
    }

    // 2. Fetch purchase request to verify existence and get details
    const [prRows] = await pool.query(
      'SELECT id, request_id, product_name, quantity, requirements, required_delivery_date FROM purchase_requests WHERE id = ? OR request_id = ? LIMIT 1',
      [purchaseRequestId, purchaseRequestId]
    );

    if (prRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Referenced Purchase Request does not exist.'
      });
    }

    const pr = prRows[0];
    const prNumericId = pr.id;

    const qty = requestedQuantity ? parseInt(requestedQuantity, 10) : pr.quantity;
    const reqs = requirements ? requirements.trim() : pr.requirements;
    const delDate = requiredDeliveryDate ? requiredDeliveryDate.trim() : pr.required_delivery_date;

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const createdQRIds = [];

    // 3. Loop through selected vendors and create quotation requests
    for (const vId of vendorIds) {
      // Find numeric vendor ID
      const [vRows] = await connection.query(
        'SELECT id, vendor_id, vendor_name, email FROM vendors WHERE (id = ? OR vendor_id = ?) AND status = ? LIMIT 1',
        [vId, vId, 'Active']
      );

      if (vRows.length === 0) {
        continue; // Skip invalid or inactive vendors
      }

      const vendor = vRows[0];
      const nextQRId = await generateQuotationRequestId(connection);

      await connection.query(
        `INSERT INTO quotation_requests 
          (quotation_request_id, purchase_request_id, vendor_id, requested_quantity, requirements, required_delivery_date, additional_message, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          nextQRId,
          prNumericId,
          vendor.id,
          qty,
          reqs,
          delDate,
          additionalMessage ? additionalMessage.trim() : null,
          'Pending'
        ]
      );

      createdQRIds.push({
        quotationRequestId: nextQRId,
        vendorId: vendor.vendor_id,
        vendorName: vendor.vendor_name
      });
    }

    if (createdQRIds.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: 'None of the selected vendors are active or valid.'
      });
    }

    // 4. Update purchase request status to 'Quotation Requested'
    await connection.query(
      'UPDATE purchase_requests SET status = ? WHERE id = ?',
      ['Quotation Requested', prNumericId]
    );

    await connection.commit();
    connection.release();

    const primaryQRId = createdQRIds[0].quotationRequestId;

    return res.status(201).json({
      success: true,
      message: 'Quotation request sent successfully.',
      quotationRequestId: primaryQRId,
      createdCount: createdQRIds.length,
      requests: createdQRIds
    });
  } catch (err) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error('[Create Quotation Request Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while sending quotation request.'
    });
  }
}

/**
 * Get All Quotation Requests (Admin view)
 */
async function getAllQuotationRequests(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT 
        qr.id,
        qr.quotation_request_id,
        qr.purchase_request_id,
        pr.request_id AS purchase_request_code,
        pr.product_name,
        pr.product_category,
        qr.vendor_id,
        v.vendor_id AS vendor_code,
        v.vendor_name,
        v.email AS vendor_email,
        qr.requested_quantity,
        qr.requirements,
        DATE_FORMAT(qr.required_delivery_date, '%d-%m-%Y') AS required_delivery_date,
        qr.additional_message,
        qr.status,
        DATE_FORMAT(qr.created_at, '%d-%m-%Y') AS request_date,
        qr.created_at
       FROM quotation_requests qr
       JOIN purchase_requests pr ON qr.purchase_request_id = pr.id
       JOIN vendors v ON qr.vendor_id = v.id
       ORDER BY qr.id DESC`
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      quotationRequests: rows
    });
  } catch (err) {
    console.error('[Get All Quotation Requests Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve quotation requests.'
    });
  }
}

/**
 * Get Single Quotation Request by ID
 */
async function getQuotationRequestById(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT 
        qr.id,
        qr.quotation_request_id,
        qr.purchase_request_id,
        pr.request_id AS purchase_request_code,
        pr.product_name,
        pr.product_category,
        qr.vendor_id,
        v.vendor_id AS vendor_code,
        v.vendor_name,
        v.email AS vendor_email,
        qr.requested_quantity,
        qr.requirements,
        DATE_FORMAT(qr.required_delivery_date, '%d-%m-%Y') AS required_delivery_date,
        qr.additional_message,
        qr.status,
        DATE_FORMAT(qr.created_at, '%d-%m-%Y') AS request_date,
        qr.created_at
       FROM quotation_requests qr
       JOIN purchase_requests pr ON qr.purchase_request_id = pr.id
       JOIN vendors v ON qr.vendor_id = v.id
       WHERE qr.id = ? OR qr.quotation_request_id = ?
       LIMIT 1`,
      [id, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Quotation request not found.'
      });
    }

    const qr = rows[0];

    // If user is a Vendor, ensure this QR belongs strictly to them!
    if (req.user.role === 'Vendor') {
      const userEmail = req.user.email.toLowerCase();
      if (qr.vendor_email.toLowerCase() !== userEmail) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: You cannot view quotation requests belonging to another vendor.'
        });
      }
    }

    return res.status(200).json({
      success: true,
      quotationRequest: qr
    });
  } catch (err) {
    console.error('[Get Quotation Request By ID Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve quotation request.'
    });
  }
}

/**
 * Get Quotation Requests for Logged-In Vendor (Vendor role only)
 * Supports authenticated vendor session or optional param :vendorId
 */
async function getVendorQuotationRequests(req, res) {
  try {
    const userRole = req.user.role;
    const userEmail = req.user.email.toLowerCase();
    const requestedVendorId = req.params.vendorId;

    let vendorQuery = 'SELECT id, vendor_id, vendor_name, email FROM vendors WHERE LOWER(email) = ? LIMIT 1';
    let queryParams = [userEmail];

    // If Admin is querying for a specific vendor
    if (userRole === 'Admin' && requestedVendorId) {
      vendorQuery = 'SELECT id, vendor_id, vendor_name, email FROM vendors WHERE id = ? OR vendor_id = ? LIMIT 1';
      queryParams = [requestedVendorId, requestedVendorId];
    }

    const [vendorRows] = await pool.query(vendorQuery, queryParams);

    if (vendorRows.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        quotationRequests: [],
        message: 'No registered vendor profile associated with this account.'
      });
    }

    const vendor = vendorRows[0];

    // Security check: if user is Vendor and requestedVendorId was provided, ensure it matches their own ID
    if (userRole === 'Vendor' && requestedVendorId) {
      if (vendor.id != requestedVendorId && vendor.vendor_id != requestedVendorId) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: You cannot view quotation requests belonging to another vendor.'
        });
      }
    }

    // Fetch quotation requests assigned ONLY to this vendor
    const [rows] = await pool.query(
      `SELECT 
        qr.id,
        qr.quotation_request_id,
        qr.purchase_request_id,
        pr.request_id AS purchase_request_code,
        pr.product_name,
        pr.product_category,
        qr.requested_quantity,
        qr.requirements,
        DATE_FORMAT(qr.required_delivery_date, '%d-%m-%Y') AS required_delivery_date,
        qr.additional_message,
        qr.status,
        DATE_FORMAT(qr.created_at, '%d-%m-%Y') AS request_date,
        qr.created_at
       FROM quotation_requests qr
       JOIN purchase_requests pr ON qr.purchase_request_id = pr.id
       WHERE qr.vendor_id = ?
       ORDER BY qr.id DESC`,
      [vendor.id]
    );

    return res.status(200).json({
      success: true,
      vendor: {
        id: vendor.id,
        vendorId: vendor.vendor_id,
        vendorName: vendor.vendor_name,
        email: vendor.email
      },
      count: rows.length,
      quotationRequests: rows
    });
  } catch (err) {
    console.error('[Get Vendor Quotation Requests Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve vendor quotation requests.'
    });
  }
}

module.exports = {
  createQuotationRequests,
  getAllQuotationRequests,
  getQuotationRequestById,
  getVendorQuotationRequests
};
