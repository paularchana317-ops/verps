const express = require('express');
const router = express.Router();
const quotationController = require('../controllers/quotationController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRole = require('../middleware/roleMiddleware');

// Submit quotation (Vendor only)
router.post(
  '/', 
  authenticateToken, 
  authorizeRole(['Vendor']), 
  quotationController.submitQuotation
);

// Get all quotations (Admin & Vendor)
router.get(
  '/', 
  authenticateToken, 
  authorizeRole(['Admin', 'Vendor']), 
  quotationController.getAllQuotations
);

// Get single quotation by ID (Admin & Vendor)
router.get(
  '/:id', 
  authenticateToken, 
  authorizeRole(['Admin', 'Vendor']), 
  quotationController.getQuotationById
);

module.exports = router;
