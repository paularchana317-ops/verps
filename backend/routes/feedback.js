const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRole = require('../middleware/roleMiddleware');

/**
 * Sprint 5: Feedback Management Routes
 * Parent Feature: SCRUM-40 - Feedback Management
 * SCRUM-31: Submit Feedback
 * SCRUM-32: View Feedback
 */

// Helper: Get source options (vendors & orders) for feedback form
router.get(
  '/sources',
  authenticateToken,
  feedbackController.getFeedbackSources
);

// SCRUM-32: View user's own authored feedback
router.get(
  '/my',
  authenticateToken,
  feedbackController.getMyFeedback
);
router.get(
  '/my-feedback',
  authenticateToken,
  feedbackController.getMyFeedback
);

// SCRUM-32: View feedback summary and breakdown for a specific vendor
router.get(
  '/vendor/:vendorId',
  authenticateToken,
  feedbackController.getVendorFeedbackSummary
);

// SCRUM-32: View feedback list (role-scoped: Vendor sees own company reviews, Admin & Users see all)
router.get(
  '/',
  authenticateToken,
  feedbackController.getAllFeedback
);

// SCRUM-31: Submit Feedback (Users/Requesters & Admins)
router.post(
  '/',
  authenticateToken,
  authorizeRole(['User/Requester', 'User', 'Requester', 'Admin']),
  feedbackController.submitFeedback
);

module.exports = router;
