/**
 * Unit Tests for authController.js (Sprint 1)
 * Covers: register, login, getProfile, validation, boundary cases, error handling, RBAC normalization.
 */

const authController = require('../controllers/authController');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { isMongoConnected } = require('../config/mongodb');
const User = require('../models/User');
const vendorController = require('../controllers/vendorController');

jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('../config/db', () => ({
  pool: {
    query: jest.fn(),
    getConnection: jest.fn()
  }
}));
jest.mock('../config/mongodb', () => ({
  isMongoConnected: jest.fn()
}));
jest.mock('../models/User', () => ({
  findOne: jest.fn(),
  create: jest.fn()
}));
jest.mock('../controllers/vendorController', () => ({
  generateVendorId: jest.fn()
}));

describe('authController Unit Tests', () => {
  let req;
  let res;
  let mockConnection;

  beforeEach(() => {
    jest.resetAllMocks();

    req = {
      body: {},
      user: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockConnection = {
      query: jest.fn().mockResolvedValue([{ insertId: 1 }]),
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn()
    };

    pool.getConnection.mockResolvedValue(mockConnection);
    pool.query.mockResolvedValue([[]]);
    isMongoConnected.mockReturnValue(false);
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue({ _id: 'new-mongo-id-789' });
    bcrypt.hash.mockResolvedValue('hashed_pwd_123');
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue('mock-jwt-token');
    vendorController.generateVendorId.mockResolvedValue('VEN-1002');
  });

  describe('register()', () => {
    const validUserPayload = {
      name: 'John Doe',
      email: 'john@example.com',
      password: 'Password123',
      confirmPassword: 'Password123',
      role: 'User/Requester'
    };

    test('should return 400 if required fields are missing', async () => {
      req.body = { email: 'john@example.com' };
      await authController.register(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: expect.stringContaining('All fields are required')
      }));
    });

    test('should return 400 if name is shorter than 2 characters (boundary)', async () => {
      req.body = { ...validUserPayload, name: 'J' };
      await authController.register(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Full Name must be at least 2 characters long.'
      }));
    });

    test('should return 400 if email format is invalid', async () => {
      req.body = { ...validUserPayload, email: 'invalid-email-format' };
      await authController.register(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Please provide a valid email address.'
      }));
    });

    test('should return 400 if role is invalid', async () => {
      req.body = { ...validUserPayload, role: 'SuperAdministrator' };
      await authController.register(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: expect.stringContaining('Invalid role selected')
      }));
    });

    test('should return 400 if passwords do not match', async () => {
      req.body = { ...validUserPayload, confirmPassword: 'DifferentPassword123' };
      await authController.register(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Password and Confirm Password do not match.'
      }));
    });

    test('should return 400 if password is less than 6 characters (boundary)', async () => {
      req.body = { ...validUserPayload, password: 'P1a', confirmPassword: 'P1a' };
      await authController.register(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Password must be at least 6 characters long.'
      }));
    });

    test('should return 400 if password lacks numbers or letters', async () => {
      req.body = { ...validUserPayload, password: 'Password', confirmPassword: 'Password' };
      await authController.register(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Password must contain at least one letter and one number.'
      }));
    });

    test('should return 409 if user already exists in MongoDB Atlas', async () => {
      isMongoConnected.mockReturnValue(true);
      User.findOne.mockResolvedValue({ _id: 'mongo-id-123', email: 'john@example.com' });

      req.body = validUserPayload;
      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: expect.stringContaining('already exists')
      }));
    });

    test('should return 409 if vendor email already exists in MongoDB Atlas', async () => {
      isMongoConnected.mockReturnValue(true);
      User.findOne.mockResolvedValue({ _id: 'mongo-id-456', email: 'vendor@example.com' });

      req.body = { ...validUserPayload, email: 'vendor@example.com', role: 'Vendor' };
      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Vendor with this email already exists. Please login instead.'
      }));
    });

    test('should return 409 if user exists in SQL users table', async () => {
      isMongoConnected.mockReturnValue(false);
      pool.query
        .mockResolvedValueOnce([[{ id: 1 }]]) // users check
        .mockResolvedValueOnce([[]]);          // vendors check

      req.body = validUserPayload;
      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false
      }));
    });

    test('should return 409 if vendor exists in SQL vendors table', async () => {
      isMongoConnected.mockReturnValue(false);
      pool.query
        .mockResolvedValueOnce([[]])          // users check
        .mockResolvedValueOnce([[{ id: 5 }]]); // vendors check

      req.body = validUserPayload;
      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Vendor with this email already exists. Please login instead.'
      }));
    });

    test('should register User successfully when MongoDB and SQL are connected', async () => {
      isMongoConnected.mockReturnValue(true);
      User.findOne.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue('hashed_pwd_123');

      pool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      User.create.mockResolvedValue({ _id: 'new-mongo-id-789' });
      mockConnection.query.mockResolvedValueOnce([{ insertId: 10 }]);

      req.body = validUserPayload;
      await authController.register(req, res);

      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        userId: 'new-mongo-id-789'
      }));
    });

    test('should register Vendor successfully, assigning Vendor ID and inserting into vendors table', async () => {
      isMongoConnected.mockReturnValue(false);
      bcrypt.hash.mockResolvedValue('hashed_vendor_pwd');
      vendorController.generateVendorId.mockResolvedValue('VEN-1002');

      pool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      mockConnection.query
        .mockResolvedValueOnce([{ insertId: 20 }]) // users insert
        .mockResolvedValueOnce([{ insertId: 5 }]);  // vendors insert

      req.body = {
        name: 'Alice Supplier',
        email: 'alice@supplier.com',
        password: 'Password123',
        confirmPassword: 'Password123',
        role: 'Vendor',
        vendorName: 'Alice Tech Corp',
        phone: '+1 555-1234',
        address: '100 Silicon Blvd',
        city: 'San Jose',
        state: 'CA',
        productCategories: 'Laptops, Monitors',
        businessRegistrationNumber: 'REG-9988',
        description: 'Authorized Hardware Vendor'
      };

      await authController.register(req, res);

      expect(vendorController.generateVendorId).toHaveBeenCalledWith(mockConnection);
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        vendorId: 'VEN-1002',
        message: expect.stringContaining('Assigned Vendor ID: VEN-1002')
      }));
    });

    test('should rollback transaction and return 500 when error occurs during registration', async () => {
      isMongoConnected.mockReturnValue(false);
      bcrypt.hash.mockResolvedValue('hashed_pwd');
      pool.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);
      mockConnection.query.mockRejectedValue(new Error('DB Connection Timeout'));

      req.body = validUserPayload;
      await authController.register(req, res);

      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: expect.stringContaining('Internal server error')
      }));
    });
  });

  describe('login()', () => {
    test('should return 400 if email or password is missing', async () => {
      req.body = { email: 'john@example.com' };
      await authController.login(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Email and password are required.'
      }));
    });

    test('should return 401 if user does not exist in Mongo or SQL', async () => {
      isMongoConnected.mockReturnValue(true);
      User.findOne.mockResolvedValue(null);
      pool.query.mockResolvedValue([[]]);

      req.body = { email: 'unknown@example.com', password: 'Password123' };
      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Invalid email or password.'
      }));
    });

    test('should return 401 if password verification fails', async () => {
      isMongoConnected.mockReturnValue(true);
      User.findOne.mockResolvedValue({
        _id: 'mongo-id-1',
        email: 'john@example.com',
        password: 'hashed_db_password',
        role: 'User/Requester'
      });
      bcrypt.compare.mockResolvedValue(false);

      req.body = { email: 'john@example.com', password: 'WrongPassword123' };
      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Invalid email or password.'
      }));
    });

    test('should login User successfully from MongoDB Atlas and redirect to /user-dashboard.html', async () => {
      isMongoConnected.mockReturnValue(true);
      User.findOne.mockResolvedValue({
        _id: 'mongo-id-user',
        name: 'John User',
        email: 'john@example.com',
        password: 'hashed_password',
        role: 'user'
      });
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('jwt-token-user');

      req.body = { email: 'john@example.com', password: 'Password123' };
      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        token: 'jwt-token-user',
        redirectUrl: '/user-dashboard.html',
        user: expect.objectContaining({
          name: 'John User',
          role: 'User/Requester'
        })
      }));
    });

    test('should login Admin successfully from SQL fallback and redirect to /admin-dashboard.html', async () => {
      isMongoConnected.mockReturnValue(false);
      pool.query.mockResolvedValue([
        [
          {
            id: 1,
            name: 'Admin Boss',
            email: 'admin@veprs.com',
            password: 'hashed_admin_password',
            role: 'Admin'
          }
        ]
      ]);
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('jwt-token-admin');

      req.body = { email: 'admin@veprs.com', password: 'Password123' };
      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        redirectUrl: '/admin-dashboard.html',
        user: expect.objectContaining({
          role: 'Admin'
        })
      }));
    });

    test('should login Vendor successfully, retrieve vendor details, and redirect to /vendor-dashboard.html', async () => {
      isMongoConnected.mockReturnValue(false);
      pool.query
        .mockResolvedValueOnce([
          [
            {
              id: 2,
              name: 'Vendor Contact',
              email: 'vendor@hardware.com',
              password: 'hashed_vendor_pwd',
              role: 'Vendor'
            }
          ]
        ])
        .mockResolvedValueOnce([
          [
            {
              id: 1,
              vendor_id: 'VEN-1001',
              vendor_name: 'Apex Hardware Supplies',
              email: 'vendor@hardware.com',
              status: 'Active'
            }
          ]
        ]);
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('jwt-token-vendor');

      req.body = { email: 'vendor@hardware.com', password: 'Password123' };
      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        redirectUrl: '/vendor-dashboard.html',
        user: expect.objectContaining({
          role: 'Vendor',
          vendorId: 'VEN-1001',
          vendorName: 'Apex Hardware Supplies'
        })
      }));
    });

    test('should return 500 when unhandled error occurs during login', async () => {
      isMongoConnected.mockImplementation(() => {
        throw new Error('Database server crashed');
      });

      req.body = { email: 'test@example.com', password: 'Password123' };
      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: expect.stringContaining('Internal server error')
      }));
    });
  });

  describe('getProfile()', () => {
    test('should return 404 if user profile is not found', async () => {
      isMongoConnected.mockReturnValue(true);
      User.findOne.mockResolvedValue(null);
      pool.query.mockResolvedValue([[]]);

      req.user = { id: 99, email: 'notfound@example.com' };
      await authController.getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'User not found.'
      }));
    });

    test('should return 200 with User profile when user is found in MongoDB', async () => {
      isMongoConnected.mockReturnValue(true);
      User.findOne.mockResolvedValue({
        _id: 'mongo-user-123',
        name: 'Jane User',
        email: 'jane@example.com',
        role: 'User/Requester'
      });

      req.user = { id: 'mongo-user-123', email: 'jane@example.com' };
      await authController.getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        user: expect.objectContaining({
          name: 'Jane User',
          role: 'User/Requester'
        })
      }));
    });

    test('should return 200 with Vendor profile including vendorProfile data from SQL', async () => {
      isMongoConnected.mockReturnValue(false);
      pool.query
        .mockResolvedValueOnce([
          [
            {
              id: 15,
              name: 'Supplier Rep',
              email: 'rep@supplier.com',
              role: 'Vendor'
            }
          ]
        ])
        .mockResolvedValueOnce([
          [
            {
              id: 2,
              vendor_id: 'VEN-1002',
              vendor_name: 'Apex Supplies',
              contact_person: 'Supplier Rep',
              email: 'rep@supplier.com',
              status: 'Active'
            }
          ]
        ]);

      req.user = { id: 15, email: 'rep@supplier.com' };
      await authController.getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        user: expect.objectContaining({
          role: 'Vendor',
          vendorProfile: expect.objectContaining({
            vendor_id: 'VEN-1002',
            vendor_name: 'Apex Supplies'
          })
        })
      }));
    });

    test('should return 500 when retrieval fails due to database error', async () => {
      isMongoConnected.mockReturnValue(false);
      pool.query.mockRejectedValue(new Error('SQL connection lost'));

      req.user = { id: 1, email: 'error@example.com' };
      await authController.getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Failed to retrieve profile.'
      }));
    });
  });
});
