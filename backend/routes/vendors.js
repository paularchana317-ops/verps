const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/vendorController');
const authController = require('../controllers/authController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRole = require('../middleware/roleMiddleware');

// Public Vendor Self-Registration endpoint (POST /api/vendors/register)
router.post('/register', (req, res, next) => {
  req.body.role = 'Vendor';
  authController.register(req, res, next);
});

// Public Recommended Vendors endpoint (for Public Home Page before Login)
router.get('/public', vendorController.getPublicRecommendedVendors);
router.get('/recommended', vendorController.getPublicRecommendedVendors);

// All other vendor management routes are restricted to Admin role only
router.post(
  '/', 
  authenticateToken, 
  authorizeRole(['Admin']), 
  vendorController.addVendor
);

router.get(
  '/', 
  authenticateToken, 
  authorizeRole(['Admin']), 
  vendorController.getAllVendors
);

router.get(
  '/active', 
  authenticateToken, 
  authorizeRole(['Admin']), 
  vendorController.getActiveVendors
);

router.get(
  '/:id', 
  authenticateToken, 
  authorizeRole(['Admin']), 
  vendorController.getVendorById
);

router.put(
  '/:id', 
  authenticateToken, 
  authorizeRole(['Admin']), 
  vendorController.updateVendor
);

module.exports = router;
