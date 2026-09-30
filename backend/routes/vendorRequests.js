const express = require('express');
const router = express.Router();
const quotationRequestController = require('../controllers/quotationRequestController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRole = require('../middleware/roleMiddleware');

// Get quotation requests assigned exclusively to the logged-in vendor
router.get(
  '/quotation-requests', 
  authenticateToken, 
  authorizeRole(['Vendor']), 
  quotationRequestController.getVendorQuotationRequests
);

module.exports = router;
