const express = require('express');
const router = express.Router();
const quotationRequestController = require('../controllers/quotationRequestController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRole = require('../middleware/roleMiddleware');

// Send quotation requests to selected vendors (Admin only)
router.post(
  '/', 
  authenticateToken, 
  authorizeRole(['Admin']), 
  quotationRequestController.createQuotationRequests
);

// Get quotation requests assigned to currently logged-in vendor (Vendor only)
router.get(
  '/vendor/me',
  authenticateToken,
  authorizeRole(['Vendor']),
  quotationRequestController.getVendorQuotationRequests
);

// Get quotation requests for specific vendor (Vendor with self-check, or Admin)
router.get(
  '/vendor/:vendorId',
  authenticateToken,
  authorizeRole(['Admin', 'Vendor']),
  quotationRequestController.getVendorQuotationRequests
);

// Get all quotation requests (Admin only)
router.get(
  '/', 
  authenticateToken, 
  authorizeRole(['Admin']), 
  quotationRequestController.getAllQuotationRequests
);

// Get specific quotation request by ID (Admin and Vendor)
router.get(
  '/:id', 
  authenticateToken, 
  authorizeRole(['Admin', 'Vendor']), 
  quotationRequestController.getQuotationRequestById
);

module.exports = router;
