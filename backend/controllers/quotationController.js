const { pool } = require('../config/db');

/**
 * Generate Next Unique Quotation ID (e.g. QUO-1001, QUO-1002, ...)
 * @param {object} connection - MySQL/SQLite connection or pool
 * @returns {Promise<string>}
 */
async function generateQuotationId(connection) {
  const [rows] = await connection.query(
    'SELECT quotation_id FROM quotations ORDER BY id DESC LIMIT 1'
  );

  let nextSeq = 1001;
  if (rows.length > 0 && rows[0].quotation_id) {
    const match = rows[0].quotation_id.match(/QUO-(\d+)/i);
    if (match && match[1]) {
      const currentNumber = parseInt(match[1], 10);
      if (!isNaN(currentNumber)) {
        nextSeq = Math.max(nextSeq, currentNumber + 1);
      }
    }
  }

  return `QUO-${nextSeq}`;
}

/**
 * Submit Quotation (SCRUM-25 - Vendor role only)
 */
async function submitQuotation(req, res) {
  let connection;
  try {
    const vendorEmail = req.user.email.toLowerCase();
    const {
      quotationRequestId,
      unitPrice,
      deliveryTime,
      validUntil,
      warranty,
      termsConditions,
      additionalNotes
    } = req.body;

    // 1. Validate required fields
    if (!quotationRequestId) {
      return res.status(400).json({
        success: false,
        message: 'Quotation Request ID is required.'
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

    if (!deliveryTime || !deliveryTime.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Delivery Time is required.'
      });
    }

    if (!validUntil || !validUntil.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Valid Until date is required.'
      });
    }

    const validUntilDateObj = new Date(validUntil);
    if (isNaN(validUntilDateObj.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid date for Valid Until.'
      });
    }

    // Format validUntil for SQL DATE
    const formattedValidUntil = validUntilDateObj.toISOString().split('T')[0];

    // 2. Fetch vendor profile
    const [vendorRows] = await pool.query(
      'SELECT id, vendor_id, vendor_name, email FROM vendors WHERE LOWER(email) = ? LIMIT 1',
      [vendorEmail]
    );

    if (vendorRows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Access Denied: No vendor profile linked with your account.'
      });
    }

    const vendor = vendorRows[0];

    // 3. Fetch quotation request
    const [qrRows] = await pool.query(
      `SELECT 
        qr.id,
        qr.quotation_request_id,
        qr.purchase_request_id,
        qr.vendor_id,
        qr.requested_quantity,
        qr.status AS qr_status,
        pr.product_name,
        pr.quantity AS pr_quantity
       FROM quotation_requests qr
       JOIN purchase_requests pr ON qr.purchase_request_id = pr.id
       WHERE (qr.id = ? OR qr.quotation_request_id = ?)
       LIMIT 1`,
      [quotationRequestId, quotationRequestId]
    );

    if (qrRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Quotation Request not found.'
      });
    }

    const qr = qrRows[0];

    // Check ownership: ensure this QR belongs to the submitting vendor!
    if (qr.vendor_id !== vendor.id) {
      return res.status(403).json({
        success: false,
        message: 'Access Denied: You are not authorized to submit a quotation for this request.'
      });
    }

    // 4. Prevent duplicate submissions for the same quotation request
    const [existingQuo] = await pool.query(
      'SELECT id, quotation_id FROM quotations WHERE quotation_request_id = ? AND vendor_id = ? LIMIT 1',
      [qr.id, vendor.id]
    );

    if (existingQuo.length > 0) {
      return res.status(400).json({
        success: false,
        message: `A quotation (${existingQuo[0].quotation_id}) has already been submitted for this quotation request.`
      });
    }

    const quantity = qr.requested_quantity || qr.pr_quantity;
    const totalPrice = parseFloat((quantity * parsedUnitPrice).toFixed(2));

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 5. Generate unique Quotation ID (QUO-1001)
    const quotationId = await generateQuotationId(connection);

    // 6. Insert quotation
    const [result] = await connection.query(
      `INSERT INTO quotations 
        (quotation_id, quotation_request_id, purchase_request_id, vendor_id, product_name, quantity, unit_price, total_price, delivery_time, valid_until, warranty, terms_conditions, additional_notes, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        quotationId,
        qr.id,
        qr.purchase_request_id,
        vendor.id,
        qr.product_name,
        quantity,
        parsedUnitPrice,
        totalPrice,
        deliveryTime.trim(),
        formattedValidUntil,
        warranty ? warranty.trim() : null,
        termsConditions ? termsConditions.trim() : null,
        additionalNotes ? additionalNotes.trim() : null,
        'Submitted'
      ]
    );

    // 7. Update quotation_request status to 'Responded'
    await connection.query(
      'UPDATE quotation_requests SET status = ? WHERE id = ?',
      ['Responded', qr.id]
    );

    // 8. Update purchase_request status to 'Quotation Received'
    await connection.query(
      'UPDATE purchase_requests SET status = ? WHERE id = ?',
      ['Quotation Received', qr.purchase_request_id]
    );

    await connection.commit();
    connection.release();

    return res.status(201).json({
      success: true,
      message: 'Quotation submitted successfully.',
      quotationId: quotationId,
      data: {
        id: result.insertId,
        quotationId,
        quotationRequestId: qr.quotation_request_id,
        purchaseRequestId: qr.purchase_request_id,
        productName: qr.product_name,
        quantity,
        unitPrice: parsedUnitPrice,
        totalPrice,
        deliveryTime: deliveryTime.trim(),
        validUntil: formattedValidUntil,
        warranty: warranty ? warranty.trim() : null,
        termsConditions: termsConditions ? termsConditions.trim() : null,
        additionalNotes: additionalNotes ? additionalNotes.trim() : null,
        status: 'Submitted'
      }
    });
  } catch (err) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error('[Submit Quotation Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while submitting quotation.'
    });
  }
}

/**
 * Get All Quotations (Admin view or Vendor view)
 */
async function getAllQuotations(req, res) {
  try {
    const isVendor = req.user.role === 'Vendor';
    let sql = `
      SELECT 
        q.id,
        q.quotation_id,
        q.quotation_request_id,
        qr.quotation_request_id AS qr_code,
        q.purchase_request_id,
        pr.request_id AS pr_code,
        q.vendor_id,
        v.vendor_id AS vendor_code,
        v.vendor_name,
        v.email AS vendor_email,
        q.product_name,
        q.quantity,
        q.unit_price,
        q.total_price,
        q.delivery_time,
        DATE_FORMAT(q.valid_until, '%d-%m-%Y') AS valid_until,
        q.warranty,
        q.terms_conditions,
        q.additional_notes,
        q.status,
        DATE_FORMAT(q.created_at, '%d-%m-%Y') AS submitted_date,
        q.created_at
       FROM quotations q
       JOIN quotation_requests qr ON q.quotation_request_id = qr.id
       JOIN purchase_requests pr ON q.purchase_request_id = pr.id
       JOIN vendors v ON q.vendor_id = v.id
    `;
    const params = [];

    if (isVendor) {
      sql += ' WHERE LOWER(v.email) = ?';
      params.push(req.user.email.toLowerCase());
    }

    sql += ' ORDER BY q.id DESC';

    const [rows] = await pool.query(sql, params);

    return res.status(200).json({
      success: true,
      count: rows.length,
      quotations: rows
    });
  } catch (err) {
    console.error('[Get All Quotations Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve quotations.'
    });
  }
}

/**
 * Get Quotation By ID
 */
async function getQuotationById(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT 
        q.id,
        q.quotation_id,
        q.quotation_request_id,
        qr.quotation_request_id AS qr_code,
        q.purchase_request_id,
        pr.request_id AS pr_code,
        q.vendor_id,
        v.vendor_id AS vendor_code,
        v.vendor_name,
        v.email AS vendor_email,
        q.product_name,
        q.quantity,
        q.unit_price,
        q.total_price,
        q.delivery_time,
        DATE_FORMAT(q.valid_until, '%d-%m-%Y') AS valid_until,
        q.warranty,
        q.terms_conditions,
        q.additional_notes,
        q.status,
        DATE_FORMAT(q.created_at, '%d-%m-%Y') AS submitted_date,
        q.created_at
       FROM quotations q
       JOIN quotation_requests qr ON q.quotation_request_id = qr.id
       JOIN purchase_requests pr ON q.purchase_request_id = pr.id
       JOIN vendors v ON q.vendor_id = v.id
       WHERE q.id = ? OR q.quotation_id = ?
       LIMIT 1`,
      [id, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found.'
      });
    }

    const quo = rows[0];

    // If role is Vendor, ensure this quotation belongs to them
    if (req.user.role === 'Vendor' && quo.vendor_email.toLowerCase() !== req.user.email.toLowerCase()) {
      return res.status(403).json({
        success: false,
        message: 'Access Denied'
      });
    }

    return res.status(200).json({
      success: true,
      quotation: quo
    });
  } catch (err) {
    console.error('[Get Quotation By ID Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve quotation details.'
    });
  }
}

module.exports = {
  generateQuotationId,
  submitQuotation,
  getAllQuotations,
  getQuotationById
};
