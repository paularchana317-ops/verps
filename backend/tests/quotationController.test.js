/**
 * Unit Tests for quotationController.js (Sprint 2)
 * Covers: generateQuotationId, submitQuotation, getAllQuotations, getQuotationById,
 * validations, boundary conditions, cross-tenant security checks, error handling.
 */

const quotationController = require('../controllers/quotationController');
const { pool } = require('../config/db');

jest.mock('../config/db', () => ({
  pool: {
    query: jest.fn(),
    getConnection: jest.fn()
  }
}));

describe('quotationController Unit Tests', () => {
  let req;
  let res;
  let mockConnection;

  beforeEach(() => {
    jest.resetAllMocks();

    req = {
      body: {},
      params: {},
      user: {
        id: 1,
        email: 'vendor@apex.com',
        role: 'Vendor'
      }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockConnection = {
      query: jest.fn().mockResolvedValue([{ insertId: 101 }]),
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn()
    };

    pool.getConnection = jest.fn().mockResolvedValue(mockConnection);
    pool.query = jest.fn().mockResolvedValue([[]]);
  });

  describe('generateQuotationId()', () => {
    test('should return QUO-1001 when quotations table is empty', async () => {
      const conn = { query: jest.fn().mockResolvedValueOnce([[]]) };
      const qId = await quotationController.generateQuotationId(conn);
      expect(qId).toBe('QUO-1001');
    });

    test('should increment sequential quotation number (QUO-1004 -> QUO-1005)', async () => {
      const conn = { query: jest.fn().mockResolvedValueOnce([[{ quotation_id: 'QUO-1004' }]]) };
      const qId = await quotationController.generateQuotationId(conn);
      expect(qId).toBe('QUO-1005');
    });

    test('should fallback to QUO-1001 if existing quotation ID does not match regex', async () => {
      const conn = { query: jest.fn().mockResolvedValueOnce([[{ quotation_id: 'CUSTOM_ID' }]]) };
      const qId = await quotationController.generateQuotationId(conn);
      expect(qId).toBe('QUO-1001');
    });
  });

  describe('submitQuotation()', () => {
    const validQuotationBody = {
      quotationRequestId: 5,
      unitPrice: 450.00,
      deliveryTime: '5-7 business days',
      validUntil: '2026-12-31',
      warranty: '2 Years Manufacturer',
      termsConditions: '30% upfront, 70% upon delivery',
      additionalNotes: 'Free expedited freight shipping included'
    };

    test('should return 400 if quotationRequestId is missing', async () => {
      req.body = { ...validQuotationBody, quotationRequestId: null };
      await quotationController.submitQuotation(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Quotation Request ID is required.'
      }));
    });

    test('should return 400 if unitPrice is missing or empty', async () => {
      req.body = { ...validQuotationBody, unitPrice: '' };
      await quotationController.submitQuotation(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Unit Price is required.'
      }));
    });

    test('should return 400 if unitPrice is zero or negative (boundary check)', async () => {
      req.body = { ...validQuotationBody, unitPrice: 0 };
      await quotationController.submitQuotation(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Unit Price must be a positive number greater than 0.'
      }));
    });

    test('should return 400 if unitPrice is not a valid number', async () => {
      req.body = { ...validQuotationBody, unitPrice: 'invalid_price' };
      await quotationController.submitQuotation(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Unit Price must be a positive number greater than 0.'
      }));
    });

    test('should return 400 if deliveryTime is missing', async () => {
      req.body = { ...validQuotationBody, deliveryTime: '   ' };
      await quotationController.submitQuotation(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Delivery Time is required.'
      }));
    });

    test('should return 400 if validUntil is missing', async () => {
      req.body = { ...validQuotationBody, validUntil: '' };
      await quotationController.submitQuotation(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Valid Until date is required.'
      }));
    });

    test('should return 400 if validUntil has invalid date format', async () => {
      req.body = { ...validQuotationBody, validUntil: 'not-a-valid-date' };
      await quotationController.submitQuotation(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Please provide a valid date for Valid Until.'
      }));
    });

    test('should return 403 if vendor profile is not found for the logged-in user', async () => {
      pool.query.mockResolvedValueOnce([[]]); // vendorRows

      req.body = validQuotationBody;
      await quotationController.submitQuotation(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Access Denied: No vendor profile linked with your account.'
      }));
    });

    test('should return 404 if quotation request is not found', async () => {
      pool.query
        .mockResolvedValueOnce([[{ id: 10, vendor_id: 'VEN-1001', email: 'vendor@apex.com' }]]) // vendorRows
        .mockResolvedValueOnce([[]]); // qrRows

      req.body = validQuotationBody;
      await quotationController.submitQuotation(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Quotation Request not found.'
      }));
    });

    test('should return 403 if vendor is not authorized for this specific quotation request (RBAC / cross-tenant)', async () => {
      pool.query
        .mockResolvedValueOnce([[{ id: 10, email: 'vendor@apex.com' }]]) // vendor profile id = 10
        .mockResolvedValueOnce([[{ id: 5, vendor_id: 99 }]]); // qr vendor_id = 99 (different vendor)

      req.body = validQuotationBody;
      await quotationController.submitQuotation(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: expect.stringContaining('Access Denied: You are not authorized')
      }));
    });

    test('should return 400 if quotation was already submitted for this request', async () => {
      pool.query
        .mockResolvedValueOnce([[{ id: 10, email: 'vendor@apex.com' }]])
        .mockResolvedValueOnce([[{ id: 5, vendor_id: 10, requested_quantity: 4 }]])
        .mockResolvedValueOnce([[{ id: 1, quotation_id: 'QUO-1001' }]]); // existingQuo check

      req.body = validQuotationBody;
      await quotationController.submitQuotation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: expect.stringContaining('A quotation (QUO-1001) has already been submitted')
      }));
    });

    test('should successfully submit quotation and update QR & PR status within database transaction', async () => {
      const mockVendor = { id: 10, vendor_id: 'VEN-1001', vendor_name: 'Apex Computing', email: 'vendor@apex.com' };
      const mockQr = {
        id: 5,
        quotation_request_id: 'QR-1005',
        purchase_request_id: 2,
        vendor_id: 10,
        requested_quantity: 10,
        product_name: 'Dell UltraSharp Monitors'
      };

      pool.query
        .mockResolvedValueOnce([[mockVendor]]) // vendor lookup
        .mockResolvedValueOnce([[mockQr]])     // QR lookup
        .mockResolvedValueOnce([[]]);          // duplicate check: none

      mockConnection.query
        .mockResolvedValueOnce([[{ quotation_id: 'QUO-1001' }]]) // generateQuotationId
        .mockResolvedValueOnce([{ insertId: 50 }])              // insert quotation
        .mockResolvedValueOnce([{ affectedRows: 1 }])           // update QR status
        .mockResolvedValueOnce([{ affectedRows: 1 }]);          // update PR status

      req.body = validQuotationBody;
      await quotationController.submitQuotation(req, res);

      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        quotationId: 'QUO-1002',
        message: 'Quotation submitted successfully.',
        data: expect.objectContaining({
          quotationId: 'QUO-1002',
          quantity: 10,
          unitPrice: 450.00,
          totalPrice: 4500.00,
          status: 'Submitted'
        })
      }));
    });

    test('should rollback transaction and return 500 when database error occurs during submission', async () => {
      pool.query
        .mockResolvedValueOnce([[{ id: 10, email: 'vendor@apex.com' }]])
        .mockResolvedValueOnce([[{ id: 5, vendor_id: 10, requested_quantity: 2, product_name: 'Keyboards' }]])
        .mockResolvedValueOnce([[]]);

      mockConnection.query.mockRejectedValue(new Error('Deadlock detected'));

      req.body = validQuotationBody;
      await quotationController.submitQuotation(req, res);

      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Internal server error while submitting quotation.'
      }));
    });
  });

  describe('getAllQuotations()', () => {
    test('should return all quotations for Admin role without vendor filtering', async () => {
      req.user = { role: 'Admin', email: 'admin@veprs.com' };
      const mockQuotations = [
        { id: 1, quotation_id: 'QUO-1001', vendor_name: 'Vendor A' },
        { id: 2, quotation_id: 'QUO-1002', vendor_name: 'Vendor B' }
      ];
      pool.query.mockResolvedValueOnce([mockQuotations]);

      await quotationController.getAllQuotations(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        count: 2,
        quotations: mockQuotations
      }));
      // Check query was called without email filter
      expect(pool.query).toHaveBeenCalledWith(
        expect.not.stringContaining('WHERE LOWER(v.email) = ?'),
        []
      );
    });

    test('should filter quotations by vendor email for Vendor role', async () => {
      req.user = { role: 'Vendor', email: 'vendor@apex.com' };
      const mockVendorQuotations = [
        { id: 1, quotation_id: 'QUO-1001', vendor_email: 'vendor@apex.com' }
      ];
      pool.query.mockResolvedValueOnce([mockVendorQuotations]);

      await quotationController.getAllQuotations(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        count: 1,
        quotations: mockVendorQuotations
      }));
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE LOWER(v.email) = ?'),
        ['vendor@apex.com']
      );
    });

    test('should return 500 when database error occurs in getAllQuotations', async () => {
      pool.query.mockRejectedValue(new Error('Connection failure'));

      await quotationController.getAllQuotations(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Failed to retrieve quotations.'
      }));
    });
  });

  describe('getQuotationById()', () => {
    test('should return 404 if quotation is not found', async () => {
      req.params = { id: 'QUO-9999' };
      pool.query.mockResolvedValueOnce([[]]);

      await quotationController.getQuotationById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Quotation not found.'
      }));
    });

    test('should return 403 if logged-in Vendor tries to view another vendors quotation (cross-tenant security)', async () => {
      req.params = { id: 'QUO-1001' };
      req.user = { role: 'Vendor', email: 'vendor1@example.com' };

      const otherVendorQuotation = {
        id: 1,
        quotation_id: 'QUO-1001',
        vendor_email: 'vendor2@example.com'
      };
      pool.query.mockResolvedValueOnce([[otherVendorQuotation]]);

      await quotationController.getQuotationById(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Access Denied'
      }));
    });

    test('should return 200 with quotation details for Admin or owning Vendor', async () => {
      req.params = { id: 'QUO-1001' };
      req.user = { role: 'Vendor', email: 'vendor1@example.com' };

      const myQuotation = {
        id: 1,
        quotation_id: 'QUO-1001',
        vendor_email: 'vendor1@example.com',
        product_name: 'Workstations',
        unit_price: 1200
      };
      pool.query.mockResolvedValueOnce([[myQuotation]]);

      await quotationController.getQuotationById(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        quotation: myQuotation
      }));
    });

    test('should return 500 when database error occurs in getQuotationById', async () => {
      req.params = { id: 'QUO-1001' };
      pool.query.mockRejectedValue(new Error('SQL crash'));

      await quotationController.getQuotationById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Failed to retrieve quotation details.'
      }));
    });
  });
});
