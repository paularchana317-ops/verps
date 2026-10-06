const express = require('express');
const router = express.Router();
const evaluationController = require('../controllers/evaluationController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRole = require('../middleware/roleMiddleware');

// Public / Authenticated Recommendation endpoint
router.get('/recommend', evaluationController.getRecommendedVendor);

// Comparison endpoint
router.get(
  '/compare', 
  authenticateToken, 
  authorizeRole(['Admin', 'User/Requester']), 
  evaluationController.compareVendors
);

// Get all evaluations (Admin and User/Requester)
router.get(
  '/', 
  authenticateToken, 
  authorizeRole(['Admin', 'User/Requester']), 
  evaluationController.getAllEvaluations
);

// Submit evaluation (Admin and User/Requester)
router.post(
  '/', 
  authenticateToken, 
  authorizeRole(['Admin', 'User/Requester']), 
  evaluationController.evaluateVendor
);

// Get single evaluation by ID
router.get(
  '/:id', 
  authenticateToken, 
  evaluationController.getEvaluationById
);

// Update existing evaluation (Admin only)
router.put(
  '/:id', 
  authenticateToken, 
  authorizeRole(['Admin']), 
  evaluationController.updateEvaluation
);

module.exports = router;
