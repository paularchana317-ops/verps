const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/vendorController');
const evaluationController = require('../controllers/evaluationController');
const authController = require('../controllers/authController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRole = require('../middleware/roleMiddleware');

// Public Vendor Self-Registration endpoint (POST /api/vendors/register)
router.post('/register', (req, res, next) => {
  req.body.role = 'Vendor';
  authController.register(req, res, next);
});

// Public / Authenticated Sprint 3 Vendor Recommendation (SCRUM-28 & Home Page)
router.get('/recommend', evaluationController.getRecommendedVendor);

// Sprint 3 Vendor Comparison (SCRUM-27)
router.get(
  '/compare', 
  authenticateToken, 
  authorizeRole(['Admin', 'User/Requester']), 
  evaluationController.compareVendors
);

// Backward-compatible Public Recommended Vendors endpoints
router.get('/public', vendorController.getPublicRecommendedVendors);
router.get('/recommended', evaluationController.getRecommendedVendor);

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
