const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRole = require('../middleware/roleMiddleware');

/**
 * Sprint 4: Order Management Routes
 * SCRUM-29: Create Order
 * SCRUM-30: Track Order
 * SCRUM-44: Update Order Status
 */

// Helper to get available source quotation/requests/vendors for order creation
router.get('/sources', authenticateToken, orderController.getOrderSources);

// User: View own orders (SCRUM-30)
router.get(
  '/my-orders',
  authenticateToken,
  authorizeRole(['User/Requester', 'User', 'Requester', 'Admin']),
  orderController.getMyOrders
);

// Vendor: View assigned orders (SCRUM-30 & SCRUM-44)
router.get(
  '/vendor-orders',
  authenticateToken,
  authorizeRole(['Vendor', 'Admin']),
  orderController.getVendorOrders
);

// Admin: View all procurement orders (SCRUM-30 & SCRUM-44)
router.get(
  '/all',
  authenticateToken,
  authorizeRole(['Admin']),
  orderController.getAllOrders
);

// Create Purchase Order (SCRUM-29)
router.post(
  '/',
  authenticateToken,
  authorizeRole(['User/Requester', 'User', 'Requester', 'Admin']),
  orderController.createOrder
);

// Get single order by ID or order_id (SCRUM-30) - checks cross-tenant ownership internally
router.get(
  '/:id',
  authenticateToken,
  orderController.getOrderById
);

// Update order status (SCRUM-44) - enforces role transition rules internally
router.put(
  '/:id/status',
  authenticateToken,
  orderController.updateOrderStatus
);

module.exports = router;
