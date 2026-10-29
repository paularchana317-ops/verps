/**
 * Unit Tests for feedbackController.js (Sprint 5: SCRUM-40, SCRUM-31, SCRUM-32)
 * Covers:
 * - SCRUM-40: Feedback Management Architecture
 * - SCRUM-31: Submit Feedback (validations, 1-5 rating, comments, vendor verification, self-review guard, vendor rating update, dual-persistence)
 * - SCRUM-32: View Feedback (role-scoping, filtering, vendor summary & star distribution, user authored reviews)
 * - getFeedbackSources: Active vendors and user orders retrieval
 */

const feedbackController = require('../controllers/feedbackController');
const { pool } = require('../config/db');
const { isMongoConnected } = require('../config/mongodb');
const Feedback = require('../models/Feedback');

jest.mock('../config/db', () => ({
  pool: {
    query: jest.fn(),
    getConnection: jest.fn()
  }
}));

jest.mock('../config/mongodb', () => ({
  isMongoConnected: jest.fn()
}));

jest.mock('../models/Feedback', () => ({
  create: jest.fn()
}));

describe('feedbackController Unit Tests (Sprint 5: SCRUM-40)', () => {
  let req;
  let res;
  let mockConnection;

  beforeEach(() => {
    jest.resetAllMocks();

    req = {
      body: {},
      params: {},
      query: {},
      user: {
        id: 1,
        name: 'Sarah Requester',
        email: 'sarah@organization.com',
        role: 'User/Requester'
      }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockConnection = {
      query: jest.fn().mockResolvedValue([{ insertId: 801 }]),
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn()
    };

    pool.getConnection = jest.fn().mockResolvedValue(mockConnection);
    pool.query = jest.fn().mockResolvedValue([[]]);
    isMongoConnected.mockReturnValue(false);
  });

  // =========================================================================
  // 1. generateFeedbackId() Tests
  // =========================================================================
  describe('generateFeedbackId()', () => {
    test('should return FB-1001 when feedback table is empty', async () => {
      const conn = { query: jest.fn().mockResolvedValueOnce([[]]) };
      const id = await feedbackController.generateFeedbackId(conn);
      expect(id).toBe('FB-1001');
    });

    test('should increment sequential feedback ID (FB-1004 -> FB-1005)', async () => {
      const conn = { query: jest.fn().mockResolvedValueOnce([[{ feedback_id: 'FB-1004' }]]) };
      const id = await feedbackController.generateFeedbackId(conn);
      expect(id).toBe('FB-1005');
    });

    test('should fallback to FB-1001 if existing ID does not match standard pattern', async () => {
      const conn = { query: jest.fn().mockResolvedValueOnce([[{ feedback_id: 'CUSTOM_REVIEW' }]]) };
      const id = await feedbackController.generateFeedbackId(conn);
      expect(id).toBe('FB-1001');
    });
  });

  // =========================================================================
  // 2. SCRUM-31: submitFeedback() Tests
  // =========================================================================
  describe('submitFeedback() [SCRUM-31]', () => {
    const validBody = {
      vendorId: 10,
      orderId: 5,
      rating: 5,
      comments: 'Outstanding keyboard quality and delivered two days ahead of schedule!',
      category: 'Delivery & Logistics'
    };

    test('should return 400 when vendorId is missing', async () => {
      req.body = { ...validBody, vendorId: null };
      await feedbackController.submitFeedback(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Vendor selection is required.'
      }));
    });

    test('should return 400 when rating is missing', async () => {
      req.body = { ...validBody, rating: null };
      await feedbackController.submitFeedback(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Rating is required.'
      }));
    });

    test('should return 400 when rating is out of 1-5 range or non-integer', async () => {
      // Test rating 0
      req.body = { ...validBody, rating: 0 };
      await feedbackController.submitFeedback(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      // Test rating 6
      req.body = { ...validBody, rating: 6 };
      await feedbackController.submitFeedback(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      // Test float 3.5
      req.body = { ...validBody, rating: 3.5 };
      await feedbackController.submitFeedback(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      // Test string
      req.body = { ...validBody, rating: 'excellent' };
      await feedbackController.submitFeedback(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Rating must be an integer between 1 and 5.'
      }));
    });

    test('should return 400 when comments are missing or blank', async () => {
      req.body = { ...validBody, comments: '   ' };
      await feedbackController.submitFeedback(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Comments / feedback remarks are required.'
      }));
    });

    test('should return 404 when vendor does not exist in database', async () => {
      req.body = validBody;
      pool.query.mockResolvedValueOnce([[]]); // No vendor
      await feedbackController.submitFeedback(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Selected vendor does not exist in the database.'
      }));
    });

    test('should return 400 when vendor attempts to review their own company', async () => {
      req.body = validBody;
      req.user = { id: 2, email: 'vendor@logix.com', role: 'Vendor' };
      const mockVendor = { id: 10, vendor_id: 'VEN-1001', vendor_name: 'TechLogix', email: 'vendor@logix.com' };
      pool.query.mockResolvedValueOnce([[mockVendor]]);

      await feedbackController.submitFeedback(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Vendors cannot submit feedback for their own organization.'
      }));
    });

    test('should successfully submit feedback and update vendor average rating', async () => {
      req.body = validBody;
      const mockVendor = { id: 10, vendor_id: 'VEN-1001', vendor_name: 'TechLogix', email: 'sales@techlogix.com' };
      const mockOrder = { id: 5, order_id: 'ORD-1001', vendor_id: 10 };

      pool.query
        .mockResolvedValueOnce([[mockVendor]]) // Vendor lookup
        .mockResolvedValueOnce([[mockOrder]]); // Order lookup

      mockConnection.query
        .mockResolvedValueOnce([[]]) // generateFeedbackId
        .mockResolvedValueOnce([{ insertId: 901 }]) // INSERT feedback
        .mockResolvedValueOnce([[{ avg_rating: 4.8 }]]) // SELECT AVG(rating)
        .mockResolvedValueOnce([{}]); // UPDATE vendors SET rating

      await feedbackController.submitFeedback(req, res);

      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        feedbackId: 'FB-1001',
        feedback: expect.objectContaining({
          vendorId: 'VEN-1001',
          rating: 5,
          category: 'Delivery & Logistics'
        })
      }));
    });

    test('should sync feedback with MongoDB Atlas when connected', async () => {
      req.body = {
        vendorId: 10,
        rating: 4,
        comments: 'Reliable supplier and great products.'
      };
      const mockVendor = { id: 10, vendor_id: 'VEN-1001', vendor_name: 'TechLogix', email: 'sales@techlogix.com' };

      pool.query.mockResolvedValueOnce([[mockVendor]]);
      mockConnection.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 902 }])
        .mockResolvedValueOnce([[{ avg_rating: 4.0 }]]);

      isMongoConnected.mockReturnValue(true);
      Feedback.create.mockResolvedValue({});

      await feedbackController.submitFeedback(req, res);

      expect(Feedback.create).toHaveBeenCalledWith(expect.objectContaining({
        feedback_id: 'FB-1001',
        rating: 4,
        category: 'General',
        comments: 'Reliable supplier and great products.'
      }));
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('should handle MongoDB sync error gracefully without crashing feedback submission', async () => {
      req.body = {
        vendorId: 10,
        rating: 5,
        comments: 'Great service'
      };
      const mockVendor = { id: 10, vendor_id: 'VEN-1001', vendor_name: 'TechLogix', email: 'sales@techlogix.com' };

      pool.query.mockResolvedValueOnce([[mockVendor]]);
      mockConnection.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 903 }])
        .mockResolvedValueOnce([[{ avg_rating: 5.0 }]]);

      isMongoConnected.mockReturnValue(true);
      Feedback.create.mockRejectedValueOnce(new Error('Mongo network error'));

      await feedbackController.submitFeedback(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('should rollback transaction and return 500 when database throws an error', async () => {
      req.body = validBody;
      const mockVendor = { id: 10, vendor_id: 'VEN-1001', vendor_name: 'TechLogix', email: 'sales@techlogix.com' };
      pool.query.mockResolvedValueOnce([[mockVendor]]);

      mockConnection.query.mockRejectedValueOnce(new Error('DB crash'));

      await feedbackController.submitFeedback(req, res);

      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Internal server error while submitting feedback.'
      }));
    });
  });

  // =========================================================================
  // 3. SCRUM-32: getAllFeedback() Tests
  // =========================================================================
  describe('getAllFeedback() [SCRUM-32]', () => {
    test('should return all feedback for Admin or User/Requester', async () => {
      const mockFeedbacks = [
        { id: 1, feedback_id: 'FB-1001', vendor_name: 'TechLogix', rating: 5 }
      ];
      pool.query.mockResolvedValueOnce([mockFeedbacks]);

      await feedbackController.getAllFeedback(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 1,
        feedbacks: mockFeedbacks
      });
    });

    test('should filter feedback to vendor company when role is Vendor', async () => {
      req.user = { id: 8, email: 'vendor@logix.com', role: 'Vendor' };
      const mockVendor = { id: 10, vendor_id: 'VEN-1001' };
      const vendorFeedbacks = [
        { id: 1, feedback_id: 'FB-1001', vendor_id: 10, rating: 5 }
      ];

      pool.query
        .mockResolvedValueOnce([[mockVendor]]) // Look up vendor profile
        .mockResolvedValueOnce([vendorFeedbacks]); // Query feedback

      await feedbackController.getAllFeedback(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 1,
        feedbacks: vendorFeedbacks
      });
    });

    test('should return empty list when vendor profile is not found for Vendor role', async () => {
      req.user = { id: 8, email: 'unknown@vendor.com', role: 'Vendor' };
      pool.query.mockResolvedValueOnce([[]]); // No vendor profile

      await feedbackController.getAllFeedback(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 0,
        feedbacks: []
      });
    });

    test('should apply query filters (vendorId, rating, category, orderId)', async () => {
      req.query = {
        vendorId: '10',
        rating: '5',
        category: 'Product Quality',
        orderId: 'ORD-1001'
      };
      pool.query.mockResolvedValueOnce([[]]);

      await feedbackController.getAllFeedback(req, res);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('AND (f.vendor_id = ? OR f.vendor_code = ?)'),
        expect.arrayContaining(['10', '10', 5, 'Product Quality', 'ORD-1001', 'ORD-1001'])
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should return 500 when database query fails', async () => {
      pool.query.mockRejectedValueOnce(new Error('SQL failure'));
      await feedbackController.getAllFeedback(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Failed to retrieve feedback.'
      }));
    });
  });

  // =========================================================================
  // 4. SCRUM-32: getVendorFeedbackSummary() Tests
  // =========================================================================
  describe('getVendorFeedbackSummary() [SCRUM-32]', () => {
    test('should return 404 when vendor does not exist', async () => {
      req.params = { vendorId: '999' };
      pool.query.mockResolvedValueOnce([[]]);

      await feedbackController.getVendorFeedbackSummary(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Vendor not found.'
      }));
    });

    test('should calculate average rating and star distribution correctly', async () => {
      req.params = { vendorId: '10' };
      const mockVendor = { id: 10, vendor_id: 'VEN-1001', vendor_name: 'TechLogix', rating: 4.5 };
      const mockReviews = [
        { id: 1, rating: 5, comments: 'Superb' },
        { id: 2, rating: 5, comments: 'Great' },
        { id: 3, rating: 4, comments: 'Good' },
        { id: 4, rating: 3, comments: 'Average' }
      ];

      pool.query
        .mockResolvedValueOnce([[mockVendor]])
        .mockResolvedValueOnce([mockReviews]);

      await feedbackController.getVendorFeedbackSummary(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        summary: expect.objectContaining({
          totalReviews: 4,
          averageRating: 4.3, // (5+5+4+3)/4 = 17/4 = 4.25 -> 4.3
          starCounts: { 5: 2, 4: 1, 3: 1, 2: 0, 1: 0 }
        }),
        feedbacks: mockReviews
      }));
    });

    test('should return 0.0 average when vendor has no feedback reviews', async () => {
      req.params = { vendorId: '10' };
      const mockVendor = { id: 10, vendor_id: 'VEN-1001', vendor_name: 'TechLogix', rating: 0.0 };

      pool.query
        .mockResolvedValueOnce([[mockVendor]])
        .mockResolvedValueOnce([[]]); // 0 reviews

      await feedbackController.getVendorFeedbackSummary(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        summary: expect.objectContaining({
          totalReviews: 0,
          averageRating: 0.0,
          starCounts: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
        })
      }));
    });

    test('should return 500 when database error occurs', async () => {
      req.params = { vendorId: '10' };
      pool.query.mockRejectedValueOnce(new Error('DB failure'));

      await feedbackController.getVendorFeedbackSummary(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // =========================================================================
  // 5. SCRUM-32: getMyFeedback() Tests
  // =========================================================================
  describe('getMyFeedback() [SCRUM-32]', () => {
    test('should return feedback authored by logged in user', async () => {
      const myReviews = [
        { id: 1, feedback_id: 'FB-1001', vendor_name: 'TechLogix', rating: 5 }
      ];
      pool.query.mockResolvedValueOnce([myReviews]);

      await feedbackController.getMyFeedback(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 1,
        feedbacks: myReviews
      });
    });

    test('should return 500 on database error', async () => {
      pool.query.mockRejectedValueOnce(new Error('DB failure'));
      await feedbackController.getMyFeedback(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // =========================================================================
  // 6. getFeedbackSources() Tests
  // =========================================================================
  describe('getFeedbackSources() Helper', () => {
    test('should return active vendors and user orders', async () => {
      const mockVendors = [{ id: 10, vendor_name: 'TechLogix' }];
      const mockOrders = [{ id: 5, order_id: 'ORD-1001' }];

      pool.query
        .mockResolvedValueOnce([mockVendors])
        .mockResolvedValueOnce([mockOrders]);

      await feedbackController.getFeedbackSources(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        vendors: mockVendors,
        orders: mockOrders
      });
    });

    test('should return 500 on database failure', async () => {
      pool.query.mockRejectedValueOnce(new Error('DB failure'));
      await feedbackController.getFeedbackSources(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
