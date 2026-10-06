/**
 * Unit Tests for vendorController.js (Sprint 2)
 * Covers: generateVendorId, addVendor, getAllVendors, getActiveVendors,
 * getPublicRecommendedVendors, getVendorById, updateVendor, validations, boundary cases, error handling.
 */

const vendorController = require('../controllers/vendorController');
const { pool } = require('../config/db');
const { isMongoConnected } = require('../config/mongodb');
const Vendor = require('../models/Vendor');

jest.mock('../config/db', () => ({
  pool: {
    query: jest.fn()
  }
}));

jest.mock('../config/mongodb', () => ({
  isMongoConnected: jest.fn()
}));

jest.mock('../models/Vendor', () => ({
  create: jest.fn(),
  findOneAndUpdate: jest.fn()
}));

describe('vendorController Unit Tests', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.resetAllMocks();

    req = {
      body: {},
      params: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    pool.query = jest.fn().mockResolvedValue([[]]);
    isMongoConnected.mockReturnValue(false);
    Vendor.create = jest.fn().mockResolvedValue({ _id: 'mock-vendor-id' });
    Vendor.findOneAndUpdate = jest.fn().mockResolvedValue({ _id: 'mock-vendor-id' });
  });

  describe('generateVendorId()', () => {
    test('should return VEN-1001 when no existing vendor exists in database', async () => {
      const mockConn = {
        query: jest.fn().mockResolvedValueOnce([[]])
      };

      const vendorId = await vendorController.generateVendorId(mockConn);
      expect(vendorId).toBe('VEN-1001');
    });

    test('should increment highest existing vendor sequence (e.g. VEN-1005 -> VEN-1006)', async () => {
      const mockConn = {
        query: jest.fn().mockResolvedValueOnce([[{ vendor_id: 'VEN-1005' }]])
      };

      const vendorId = await vendorController.generateVendorId(mockConn);
      expect(vendorId).toBe('VEN-1006');
    });

    test('should fallback to VEN-1001 if existing vendor ID format does not match regex', async () => {
      const mockConn = {
        query: jest.fn().mockResolvedValueOnce([[{ vendor_id: 'CUSTOM_VENDOR' }]])
      };

      const vendorId = await vendorController.generateVendorId(mockConn);
      expect(vendorId).toBe('VEN-1001');
    });
  });

  describe('addVendor()', () => {
    const validVendorBody = {
      vendorName: 'Apex Computing Supplies',
      contactPerson: 'Alex Mercer',
      email: 'alex@apexcomputing.com',
      phone: '+1 408-555-0199',
      address: '742 Evergreen Terrace',
      city: 'Springfield',
      state: 'IL',
      productCategories: 'Laptops, Monitors, Keyboards',
      businessRegistrationNumber: 'BRN-882211',
      description: 'Premier Enterprise IT Supplier'
    };

    test('should return 400 if vendorName is missing or empty', async () => {
      req.body = { ...validVendorBody, vendorName: '   ' };
      await vendorController.addVendor(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Vendor Name is required.'
      }));
    });

    test('should return 400 if contactPerson is missing', async () => {
      req.body = { ...validVendorBody, contactPerson: '' };
      await vendorController.addVendor(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Contact Person is required.'
      }));
    });

    test('should return 400 if email is missing', async () => {
      req.body = { ...validVendorBody, email: '' };
      await vendorController.addVendor(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Email address is required.'
      }));
    });

    test('should return 400 if email format is invalid', async () => {
      req.body = { ...validVendorBody, email: 'bad-email-format' };
      await vendorController.addVendor(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Please provide a valid email address.'
      }));
    });

    test('should return 400 if phone number is missing', async () => {
      req.body = { ...validVendorBody, phone: '' };
      await vendorController.addVendor(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Phone number is required.'
      }));
    });

    test('should return 400 if phone number format is invalid', async () => {
      req.body = { ...validVendorBody, phone: '123' }; // Less than 7 chars
      await vendorController.addVendor(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Please provide a valid phone number.'
      }));
    });

    test('should return 400 if address is missing', async () => {
      req.body = { ...validVendorBody, address: '   ' };
      await vendorController.addVendor(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Address is required.'
      }));
    });

    test('should return 409 if vendor email already exists', async () => {
      pool.query.mockResolvedValueOnce([[{ id: 3 }]]); // duplicate check

      req.body = validVendorBody;
      await vendorController.addVendor(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Vendor with this email already exists.'
      }));
    });

    test('should create vendor successfully and sync with MongoDB Atlas when connected', async () => {
      isMongoConnected.mockReturnValue(true);
      pool.query
        .mockResolvedValueOnce([[]])                                      // duplicate check
        .mockResolvedValueOnce([[{ vendor_id: 'VEN-1002' }]])             // generateVendorId
        .mockResolvedValueOnce([{ insertId: 10 }]);                       // insert vendor

      Vendor.create.mockResolvedValue({ _id: 'mongo-vendor-1' });

      req.body = validVendorBody;
      await vendorController.addVendor(req, res);

      expect(Vendor.create).toHaveBeenCalledWith(expect.objectContaining({
        vendor_id: 'VEN-1003',
        email: 'alex@apexcomputing.com',
        vendor_name: 'Apex Computing Supplies'
      }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        vendorId: 'VEN-1003',
        message: 'Vendor added successfully.'
      }));
    });

    test('should continue successfully even if MongoDB sync throws a warning', async () => {
      isMongoConnected.mockReturnValue(true);
      pool.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]) // empty table => VEN-1001
        .mockResolvedValueOnce([{ insertId: 11 }]);

      Vendor.create.mockRejectedValue(new Error('Mongo Network Timeout'));

      req.body = validVendorBody;
      await vendorController.addVendor(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        vendorId: 'VEN-1001'
      }));
    });

    test('should return 500 when database throws an error', async () => {
      pool.query.mockRejectedValue(new Error('Database disk full'));

      req.body = validVendorBody;
      await vendorController.addVendor(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: expect.stringContaining('Internal server error')
      }));
    });
  });

  describe('getAllVendors()', () => {
    test('should return 200 with all vendors list', async () => {
      const mockVendors = [
        { id: 1, vendor_id: 'VEN-1001', vendor_name: 'Vendor One' },
        { id: 2, vendor_id: 'VEN-1002', vendor_name: 'Vendor Two' }
      ];
      pool.query.mockResolvedValueOnce([mockVendors]);

      await vendorController.getAllVendors(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        count: 2,
        vendors: mockVendors
      }));
    });

    test('should return 500 if database query fails in getAllVendors', async () => {
      pool.query.mockRejectedValue(new Error('SQL read error'));

      await vendorController.getAllVendors(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Failed to retrieve vendors.'
      }));
    });
  });

  describe('getActiveVendors()', () => {
    test('should return 200 with only active vendors', async () => {
      const mockActive = [{ id: 1, vendor_id: 'VEN-1001', status: 'Active' }];
      pool.query.mockResolvedValueOnce([mockActive]);

      await vendorController.getActiveVendors(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        count: 1,
        vendors: mockActive
      }));
    });

    test('should return 500 if database query fails in getActiveVendors', async () => {
      pool.query.mockRejectedValue(new Error('DB failure'));

      await vendorController.getActiveVendors(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Failed to retrieve active vendors.'
      }));
    });
  });

  describe('getPublicRecommendedVendors()', () => {
    test('should return 200 with recommended vendors enriched with ratings and badges', async () => {
      const mockActive = [
        { id: 1, vendor_id: 'VEN-1001', vendor_name: 'V1', product_categories: 'Hardware' }
      ];
      pool.query.mockResolvedValueOnce([mockActive]);

      await vendorController.getPublicRecommendedVendors(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        count: 1,
        vendors: expect.arrayContaining([
          expect.objectContaining({
            rating: 4.9,
            badge: 'Top Rated Supplier',
            category: 'Hardware'
          })
        ])
      }));
    });

    test('should return 500 if getPublicRecommendedVendors fails', async () => {
      pool.query.mockRejectedValue(new Error('DB query error'));

      await vendorController.getPublicRecommendedVendors(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Failed to retrieve recommended vendors.'
      }));
    });
  });

  describe('getVendorById()', () => {
    test('should return 404 if vendor does not exist', async () => {
      req.params = { id: 'VEN-9999' };
      pool.query.mockResolvedValueOnce([[]]);

      await vendorController.getVendorById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Vendor not found.'
      }));
    });

    test('should return 200 with vendor details if found', async () => {
      const mockVendor = { id: 1, vendor_id: 'VEN-1001', vendor_name: 'Apex Computing' };
      req.params = { id: 'VEN-1001' };
      pool.query.mockResolvedValueOnce([[mockVendor]]);

      await vendorController.getVendorById(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        vendor: mockVendor
      }));
    });

    test('should return 500 if database error occurs in getVendorById', async () => {
      req.params = { id: 'VEN-1001' };
      pool.query.mockRejectedValue(new Error('DB read error'));

      await vendorController.getVendorById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Failed to retrieve vendor details.'
      }));
    });
  });

  describe('updateVendor()', () => {
    const validUpdateBody = {
      vendorName: 'Apex Computing Solutions Updated',
      contactPerson: 'Alex Mercer',
      email: 'alex.updated@apex.com',
      phone: '+1 408-555-9988',
      address: '800 Innovation Way',
      city: 'San Jose',
      state: 'CA',
      productCategories: 'Laptops, Servers, Cloud Gear',
      businessRegistrationNumber: 'BRN-882211',
      description: 'Updated enterprise vendor profile',
      status: 'Active'
    };

    test('should return 404 if vendor to update does not exist', async () => {
      req.params = { id: 'VEN-9999' };
      pool.query.mockResolvedValueOnce([[]]); // vendorCheck

      await vendorController.updateVendor(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Vendor not found.'
      }));
    });

    test('should return 400 if vendorName is missing in update', async () => {
      req.params = { id: '1' };
      pool.query.mockResolvedValueOnce([[{ id: 1, vendor_id: 'VEN-1001', email: 'test@apex.com' }]]);

      req.body = { ...validUpdateBody, vendorName: '' };
      await vendorController.updateVendor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Vendor Name is required.'
      }));
    });

    test('should return 400 if contactPerson is missing in update', async () => {
      req.params = { id: '1' };
      pool.query.mockResolvedValueOnce([[{ id: 1, vendor_id: 'VEN-1001', email: 'test@apex.com' }]]);

      req.body = { ...validUpdateBody, contactPerson: '' };
      await vendorController.updateVendor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Contact Person is required.'
      }));
    });

    test('should return 400 if email is missing or invalid in update', async () => {
      req.params = { id: '1' };
      pool.query.mockResolvedValueOnce([[{ id: 1, vendor_id: 'VEN-1001', email: 'test@apex.com' }]]);

      req.body = { ...validUpdateBody, email: 'bademail' };
      await vendorController.updateVendor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Please provide a valid email address.'
      }));
    });

    test('should return 400 if phone is missing in update', async () => {
      req.params = { id: '1' };
      pool.query.mockResolvedValueOnce([[{ id: 1, vendor_id: 'VEN-1001', email: 'test@apex.com' }]]);

      req.body = { ...validUpdateBody, phone: '' };
      await vendorController.updateVendor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Phone number is required.'
      }));
    });

    test('should return 400 if address is missing in update', async () => {
      req.params = { id: '1' };
      pool.query.mockResolvedValueOnce([[{ id: 1, vendor_id: 'VEN-1001', email: 'test@apex.com' }]]);

      req.body = { ...validUpdateBody, address: '' };
      await vendorController.updateVendor(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Address is required.'
      }));
    });

    test('should return 409 if updated email already belongs to another vendor', async () => {
      req.params = { id: '1' };
      pool.query
        .mockResolvedValueOnce([[{ id: 1, vendor_id: 'VEN-1001', email: 'old@apex.com' }]]) // vendorCheck
        .mockResolvedValueOnce([[{ id: 2 }]]); // duplicateEmail check

      req.body = validUpdateBody;
      await vendorController.updateVendor(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Another vendor already uses this email address.'
      }));
    });

    test('should update vendor details successfully in SQL and sync to MongoDB Atlas', async () => {
      isMongoConnected.mockReturnValue(true);
      req.params = { id: '1' };
      pool.query
        .mockResolvedValueOnce([[{ id: 1, vendor_id: 'VEN-1001', email: 'alex@apex.com' }]]) // vendorCheck
        .mockResolvedValueOnce([[]])                                                          // duplicateEmail check
        .mockResolvedValueOnce([{ affectedRows: 1 }]);                                         // update query

      Vendor.findOneAndUpdate.mockResolvedValue({ vendor_id: 'VEN-1001' });

      req.body = { ...validUpdateBody, status: 'Inactive' };
      await vendorController.updateVendor(req, res);

      expect(Vendor.findOneAndUpdate).toHaveBeenCalledWith(
        { vendor_id: 'VEN-1001' },
        expect.objectContaining({
          status: 'Inactive',
          vendor_name: 'Apex Computing Solutions Updated'
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        vendorId: 'VEN-1001',
        message: 'Vendor details updated successfully.'
      }));
    });

    test('should return 500 when database error occurs during update', async () => {
      req.params = { id: '1' };
      pool.query
        .mockResolvedValueOnce([[{ id: 1, vendor_id: 'VEN-1001', email: 'alex@apex.com' }]])
        .mockResolvedValueOnce([[]])
        .mockRejectedValueOnce(new Error('Update failed'));

      req.body = validUpdateBody;
      await vendorController.updateVendor(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Internal server error while updating vendor.'
      }));
    });
  });
});
