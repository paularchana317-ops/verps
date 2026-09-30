const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRole = require('../middleware/roleMiddleware');

// User / Requester routes
router.post(
  '/', 
  authenticateToken, 
  authorizeRole(['User/Requester']), 
  requestController.submitRequest
);

router.get(
  '/my-requests', 
  authenticateToken, 
  authorizeRole(['User/Requester']), 
  requestController.getMyRequests
);

// Admin routes
router.get(
  '/all', 
  authenticateToken, 
  authorizeRole(['Admin']), 
  requestController.getAllRequests
);

// Specific request by ID (Admin, User/Requester, Vendor)
router.get(
  '/:id',
  authenticateToken,
  requestController.getRequestById
);

module.exports = router;
