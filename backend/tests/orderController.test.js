/**
 * Unit Tests for orderController.js (Sprint 4: SCRUM-29, SCRUM-30, SCRUM-44)
 * Covers:
 * - SCRUM-29: Create Order (validations, price calculation, sequential ID, vendor lookup, duplicate quote guard, transaction, PR/quotation status updates, dual-persistence)
 * - SCRUM-30: Track Orders & Access Control (getMyOrders, getVendorOrders, getAllOrders, getOrderById, cross-tenant 403 enforcement)
 * - SCRUM-44: Role-Based Order Status Transitions (User cancellation of Placed orders, Vendor fulfillment pipeline, Admin overrides, terminal state immutability)
 * - getOrderSources: Helper to fetch approved PRs, active quotations, and vendors
 */

const orderController = require('../controllers/orderController');
const { pool } = require('../config/db');
const { isMongoConnected } = require('../config/mongodb');
const Order = require('../models/Order');

jest.mock('../config/db', () => ({
  pool: {
    query: jest.fn(),
    getConnection: jest.fn()
  }
}));

jest.mock('../config/mongodb', () => ({
  isMongoConnected: jest.fn()
}));

jest.mock('../models/Order', () => ({
  create: jest.fn(),
  findOneAndUpdate: jest.fn()
}));

describe('orderController Unit Tests (Sprint 4)', () => {
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
        name: 'John Requester',
        email: 'john@organization.com',
        role: 'User'
      }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockConnection = {
      query: jest.fn().mockResolvedValue([{ insertId: 501 }]),
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
  // 1. generateOrderId() Tests
  // =========================================================================
  describe('generateOrderId()', () => {
    test('should return ORD-1001 when orders table is empty', async () => {
      const conn = { query: jest.fn().mockResolvedValueOnce([[]]) };
      const id = await orderController.generateOrderId(conn);
      expect(id).toBe('ORD-1001');
    });

    test('should increment sequential order ID (ORD-1005 -> ORD-1006)', async () => {
      const conn = { query: jest.fn().mockResolvedValueOnce([[{ order_id: 'ORD-1005' }]]) };
      const id = await orderController.generateOrderId(conn);
      expect(id).toBe('ORD-1006');
    });

    test('should handle non-matching or malformed order_id gracefully', async () => {
      const conn = { query: jest.fn().mockResolvedValueOnce([[{ order_id: 'CUSTOM-PO' }]]) };
      const id = await orderController.generateOrderId(conn);
      expect(id).toBe('ORD-1001');
    });
  });

  // =========================================================================
  // 2. SCRUM-29: createOrder() Tests
  // =========================================================================
  describe('createOrder() [SCRUM-29]', () => {
    const validBody = {
      vendorId: 10,
      productName: 'Ergonomic Mechanical Keyboard',
      productCategory: 'Computer Accessories',
      quantity: 5,
      unitPrice: 45.50,
      deliveryAddress: 'Building A, Procurement Dept, Floor 3',
      contactPhone: '555-0199',
      notes: 'Priority batch delivery',
      purchaseRequestId: 12,
      quotationId: 4
    };

    test('should return 400 when vendorId is missing', async () => {
      req.body = { ...validBody, vendorId: null };
      await orderController.createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Vendor selection is required.'
      }));
    });

    test('should return 400 when productName is missing or blank', async () => {
      req.body = { ...validBody, productName: '   ' };
      await orderController.createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Product Name is required.'
      }));
    });

    test('should return 400 when quantity is missing or invalid', async () => {
      req.body = { ...validBody, quantity: null };
      await orderController.createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      req.body = { ...validBody, quantity: 0 };
      await orderController.createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Quantity must be a positive integer greater than 0.'
      }));
    });

    test('should return 400 when unitPrice is missing or invalid', async () => {
      req.body = { ...validBody, unitPrice: null };
      await orderController.createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      req.body = { ...validBody, unitPrice: -10 };
      await orderController.createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Unit Price must be a positive number greater than 0.'
      }));
    });

    test('should return 400 when deliveryAddress is missing or blank', async () => {
      req.body = { ...validBody, deliveryAddress: '   ' };
      await orderController.createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Delivery Address is required.'
      }));
    });

    test('should return 404 when selected vendor does not exist in DB', async () => {
      req.body = validBody;
      pool.query.mockResolvedValueOnce([[]]); // No vendor
      await orderController.createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Selected vendor does not exist in the database.'
      }));
    });

    test('should return 400 when an active order already exists for the quotation (duplicate prevention)', async () => {
      req.body = validBody;
      const mockVendor = { id: 10, vendor_id: 'VEN-1001', vendor_name: 'TechLogix', product_categories: 'Hardware' };
      pool.query
        .mockResolvedValueOnce([[mockVendor]]) // Vendor lookup
        .mockResolvedValueOnce([[{ id: 12, request_id: 'PR-1002' }]]) // PR lookup
        .mockResolvedValueOnce([[{ id: 4, quotation_id: 'QUO-1004' }]]) // Quote lookup
        .mockResolvedValueOnce([[{ id: 99, order_id: 'ORD-1002' }]]); // Existing order with quotation

      await orderController.createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: expect.stringContaining('already been placed for this quotation')
      }));
    });

    test('should successfully create order and calculate total price (5 * 45.50 = 227.50)', async () => {
      req.body = validBody;
      const mockVendor = { id: 10, vendor_id: 'VEN-1001', vendor_name: 'TechLogix', product_categories: 'Hardware' };
      
      pool.query
        .mockResolvedValueOnce([[mockVendor]]) // Vendor lookup
        .mockResolvedValueOnce([[{ id: 12, request_id: 'PR-1002' }]]) // PR lookup
        .mockResolvedValueOnce([[{ id: 4, quotation_id: 'QUO-1004' }]]) // Quote lookup
        .mockResolvedValueOnce([[]]); // No duplicate quotation

      mockConnection.query
        .mockResolvedValueOnce([[]]) // generateOrderId query
        .mockResolvedValueOnce([{ insertId: 701 }]) // INSERT order
        .mockResolvedValueOnce([{}]) // UPDATE purchase_requests status
        .mockResolvedValueOnce([{}]); // UPDATE quotations status

      await orderController.createOrder(req, res);

      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        orderId: 'ORD-1001',
        order: expect.objectContaining({
          quantity: 5,
          unitPrice: 45.50,
          totalPrice: 227.50,
          status: 'Placed'
        })
      }));
    });

    test('should create order and sync with MongoDB Atlas when connected', async () => {
      req.body = {
        vendorId: 10,
        productName: 'USB-C Dock',
        quantity: 2,
        unitPrice: 100,
        deliveryAddress: 'Floor 2'
      };
      const mockVendor = { id: 10, vendor_id: 'VEN-1001', vendor_name: 'TechLogix', phone: '123' };
      
      pool.query.mockResolvedValueOnce([[mockVendor]]);
      mockConnection.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 702 }]);

      isMongoConnected.mockReturnValue(true);
      Order.create.mockResolvedValue({});

      await orderController.createOrder(req, res);

      expect(Order.create).toHaveBeenCalledWith(expect.objectContaining({
        order_id: 'ORD-1001',
        product_name: 'USB-C Dock',
        quantity: 2,
        total_price: 200,
        status: 'Placed'
      }));
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('should handle MongoDB creation error gracefully without crashing order creation', async () => {
      req.body = {
        vendorId: 10,
        productName: 'USB-C Dock',
        quantity: 1,
        unitPrice: 50,
        deliveryAddress: 'Floor 1'
      };
      const mockVendor = { id: 10, vendor_id: 'VEN-1001', vendor_name: 'TechLogix' };
      
      pool.query.mockResolvedValueOnce([[mockVendor]]);
      mockConnection.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 703 }]);

      isMongoConnected.mockReturnValue(true);
      Order.create.mockRejectedValueOnce(new Error('Mongo network timeout'));

      await orderController.createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('should rollback transaction and return 500 when database throws an error', async () => {
      req.body = validBody;
      const mockVendor = { id: 10, vendor_id: 'VEN-1001', vendor_name: 'TechLogix' };
      pool.query.mockResolvedValueOnce([[mockVendor]]);

      mockConnection.query.mockRejectedValueOnce(new Error('DB Connection Dropped'));

      await orderController.createOrder(req, res);

      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Internal server error while creating order.'
      }));
    });
  });

  // =========================================================================
  // 3. SCRUM-30: getMyOrders() Tests
  // =========================================================================
  describe('getMyOrders() [SCRUM-30]', () => {
    test('should return list of orders for authenticated user', async () => {
      const mockOrders = [
        { id: 1, order_id: 'ORD-1001', product_name: 'Keyboard', status: 'Placed' }
      ];
      pool.query.mockResolvedValueOnce([mockOrders]);

      await orderController.getMyOrders(req, res);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE o.user_id = ? OR LOWER(o.user_email) = ?'),
        [1, 'john@organization.com']
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 1,
        orders: mockOrders
      });
    });

    test('should return 500 when query fails', async () => {
      pool.query.mockRejectedValueOnce(new Error('DB read error'));
      await orderController.getMyOrders(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Failed to retrieve orders.'
      }));
    });
  });

  // =========================================================================
  // 4. getVendorOrders() Tests
  // =========================================================================
  describe('getVendorOrders() [SCRUM-30 & SCRUM-44]', () => {
    beforeEach(() => {
      req.user = { id: 5, email: 'sales@techlogix.com', role: 'Vendor' };
    });

    test('should return empty list when vendor profile is not found', async () => {
      pool.query.mockResolvedValueOnce([[]]); // No vendor
      await orderController.getVendorOrders(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 0,
        orders: []
      });
    });

    test('should return orders for vendor', async () => {
      pool.query
        .mockResolvedValueOnce([[{ id: 10, vendor_id: 'VEN-1001' }]])
        .mockResolvedValueOnce([[{ id: 1, order_id: 'ORD-1001', vendor_id: 10 }]]);

      await orderController.getVendorOrders(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        count: 1
      }));
    });

    test('should return 500 on database error', async () => {
      pool.query.mockRejectedValueOnce(new Error('DB failure'));
      await orderController.getVendorOrders(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // =========================================================================
  // 5. getAllOrders() Tests
  // =========================================================================
  describe('getAllOrders() [SCRUM-30 & SCRUM-44 Admin]', () => {
    test('should return all orders for admin', async () => {
      const allOrders = [{ id: 1, order_id: 'ORD-1001' }, { id: 2, order_id: 'ORD-1002' }];
      pool.query.mockResolvedValueOnce([allOrders]);

      await orderController.getAllOrders(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 2,
        orders: allOrders
      });
    });

    test('should return 500 on error', async () => {
      pool.query.mockRejectedValueOnce(new Error('DB failure'));
      await orderController.getAllOrders(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // =========================================================================
  // 6. getOrderById() Tests & Access Control
  // =========================================================================
  describe('getOrderById() [SCRUM-30]', () => {
    test('should return 404 when order does not exist', async () => {
      req.params = { id: 999 };
      pool.query.mockResolvedValueOnce([[]]);
      await orderController.getOrderById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Order not found.'
      }));
    });

    test('should return 403 when User tries to access another user order', async () => {
      req.params = { id: 10 };
      req.user = { id: 1, email: 'john@org.com', role: 'User' };
      const order = { id: 10, user_id: 2, user_email: 'other@org.com' };
      pool.query.mockResolvedValueOnce([[order]]);

      await orderController.getOrderById(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: expect.stringContaining('Access Denied')
      }));
    });

    test('should return 200 when User accesses their own order', async () => {
      req.params = { id: 10 };
      req.user = { id: 1, email: 'john@org.com', role: 'User' };
      const order = { id: 10, user_id: 1, user_email: 'john@org.com', order_id: 'ORD-1010' };
      pool.query.mockResolvedValueOnce([[order]]);

      await orderController.getOrderById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        order
      }));
    });

    test('should return 403 when Vendor accesses an order not assigned to them', async () => {
      req.params = { id: 10 };
      req.user = { id: 3, email: 'intruder@vendor.com', role: 'Vendor' };
      const order = { id: 10, vendor_id: 5, vendor_code: 'VEN-5' };
      pool.query
        .mockResolvedValueOnce([[order]])
        .mockResolvedValueOnce([[{ id: 99, vendor_id: 'VEN-99' }]]); // Logged in vendor profile

      await orderController.getOrderById(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('should return 200 when Vendor accesses their assigned order', async () => {
      req.params = { id: 10 };
      req.user = { id: 3, email: 'assigned@vendor.com', role: 'Vendor' };
      const order = { id: 10, vendor_id: 5, vendor_code: 'VEN-5' };
      pool.query
        .mockResolvedValueOnce([[order]])
        .mockResolvedValueOnce([[{ id: 5, vendor_id: 'VEN-5' }]]); // Matches

      await orderController.getOrderById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        order
      }));
    });

    test('should return 200 when Admin accesses any order', async () => {
      req.params = { id: 10 };
      req.user = { id: 99, email: 'admin@veprs.com', role: 'Admin' };
      const order = { id: 10, user_id: 55, vendor_id: 77 };
      pool.query.mockResolvedValueOnce([[order]]);

      await orderController.getOrderById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        order
      }));
    });

    test('should return 500 on database error', async () => {
      req.params = { id: 10 };
      pool.query.mockRejectedValueOnce(new Error('DB failure'));
      await orderController.getOrderById(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // =========================================================================
  // 7. SCRUM-44: updateOrderStatus() Tests
  // =========================================================================
  describe('updateOrderStatus() [SCRUM-44]', () => {
    test('should return 400 when status is missing or invalid', async () => {
      req.params = { id: 1 };
      req.body = { status: 'InvalidStatus' };
      await orderController.updateOrderStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: expect.stringContaining('Invalid order status')
      }));
    });

    test('should return 404 when order does not exist', async () => {
      req.params = { id: 999 };
      req.body = { status: 'Processing' };
      pool.query.mockResolvedValueOnce([[]]);
      await orderController.updateOrderStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('should return 400 when attempting to modify Delivered (terminal) order', async () => {
      req.params = { id: 1 };
      req.body = { status: 'Cancelled' };
      const order = { id: 1, status: 'Delivered' };
      pool.query.mockResolvedValueOnce([[order]]);

      await orderController.updateOrderStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('already been Delivered')
      }));
    });

    test('should return 400 when attempting to modify Cancelled (terminal) order', async () => {
      req.params = { id: 1 };
      req.body = { status: 'Processing' };
      const order = { id: 1, status: 'Cancelled' };
      pool.query.mockResolvedValueOnce([[order]]);

      await orderController.updateOrderStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('has been Cancelled')
      }));
    });

    // Sub-suite: User / Requester Rules
    describe('Requester Transitions', () => {
      beforeEach(() => {
        req.user = { id: 1, email: 'john@org.com', role: 'User' };
      });

      test('should return 403 when user attempts to update another users order', async () => {
        req.params = { id: 1 };
        req.body = { status: 'Cancelled' };
        const order = { id: 1, user_id: 99, user_email: 'someone@org.com', status: 'Placed' };
        pool.query.mockResolvedValueOnce([[order]]);

        await orderController.updateOrderStatus(req, res);
        expect(res.status).toHaveBeenCalledWith(403);
      });

      test('should return 403 when user attempts fulfillment transition (e.g. Shipped/Delivered)', async () => {
        req.params = { id: 1 };
        req.body = { status: 'Shipped' };
        const order = { id: 1, user_id: 1, user_email: 'john@org.com', status: 'Placed' };
        pool.query.mockResolvedValueOnce([[order]]);

        await orderController.updateOrderStatus(req, res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          message: expect.stringContaining('Requesters can only cancel placed orders')
        }));
      });

      test('should return 400 when user attempts to cancel an order that is already Processing', async () => {
        req.params = { id: 1 };
        req.body = { status: 'Cancelled' };
        const order = { id: 1, user_id: 1, user_email: 'john@org.com', status: 'Processing' };
        pool.query.mockResolvedValueOnce([[order]]);

        await orderController.updateOrderStatus(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          message: expect.stringContaining('cannot be cancelled directly by requester')
        }));
      });

      test('should allow requester to cancel a Placed order and sync with Mongo', async () => {
        req.params = { id: 1 };
        req.body = { status: 'Cancelled', comment: 'Ordered by mistake' };
        const order = { id: 1, order_id: 'ORD-1001', user_id: 1, user_email: 'john@org.com', status: 'Placed' };
        pool.query
          .mockResolvedValueOnce([[order]])
          .mockResolvedValueOnce([{}]); // UPDATE query

        isMongoConnected.mockReturnValue(true);
        Order.findOneAndUpdate.mockResolvedValue({});

        await orderController.updateOrderStatus(req, res);

        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE orders SET status = ?'),
          ['Cancelled', 1]
        );
        expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
          { order_id: 'ORD-1001' },
          expect.objectContaining({
            $set: expect.objectContaining({ status: 'Cancelled' })
          })
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          success: true,
          previousStatus: 'Placed',
          currentStatus: 'Cancelled'
        }));
      });
    });

    // Sub-suite: Vendor Transitions
    describe('Vendor Transitions', () => {
      beforeEach(() => {
        req.user = { id: 8, email: 'vendor@logix.com', role: 'Vendor' };
      });

      test('should return 403 when vendor tries to update unassigned order', async () => {
        req.params = { id: 1 };
        req.body = { status: 'Processing' };
        const order = { id: 1, vendor_id: 99, vendor_code: 'VEN-99', status: 'Placed' };
        pool.query
          .mockResolvedValueOnce([[order]])
          .mockResolvedValueOnce([[{ id: 10, vendor_id: 'VEN-10' }]]); // Vendor mismatch

        await orderController.updateOrderStatus(req, res);
        expect(res.status).toHaveBeenCalledWith(403);
      });

      test('should return 400 when vendor skips pipeline steps (Placed -> Delivered)', async () => {
        req.params = { id: 1 };
        req.body = { status: 'Delivered' };
        const order = { id: 1, vendor_id: 10, vendor_code: 'VEN-10', status: 'Placed' };
        pool.query
          .mockResolvedValueOnce([[order]])
          .mockResolvedValueOnce([[{ id: 10, vendor_id: 'VEN-10' }]]);

        await orderController.updateOrderStatus(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          message: expect.stringContaining('Invalid transition for vendor')
        }));
      });

      test('should allow vendor valid step: Placed -> Processing', async () => {
        req.params = { id: 1 };
        req.body = { status: 'Processing' };
        const order = { id: 1, order_id: 'ORD-1001', vendor_id: 10, vendor_code: 'VEN-10', status: 'Placed' };
        pool.query
          .mockResolvedValueOnce([[order]])
          .mockResolvedValueOnce([[{ id: 10, vendor_id: 'VEN-10' }]])
          .mockResolvedValueOnce([{}]);

        await orderController.updateOrderStatus(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          success: true,
          previousStatus: 'Placed',
          currentStatus: 'Processing'
        }));
      });

      test('should allow vendor valid step: Processing -> Shipped', async () => {
        req.params = { id: 1 };
        req.body = { status: 'Shipped' };
        const order = { id: 1, order_id: 'ORD-1001', vendor_id: 10, vendor_code: 'VEN-10', status: 'Processing' };
        pool.query
          .mockResolvedValueOnce([[order]])
          .mockResolvedValueOnce([[{ id: 10, vendor_id: 'VEN-10' }]])
          .mockResolvedValueOnce([{}]);

        await orderController.updateOrderStatus(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          currentStatus: 'Shipped'
        }));
      });

      test('should allow vendor valid step: Shipped -> Delivered', async () => {
        req.params = { id: 1 };
        req.body = { status: 'Delivered' };
        const order = { id: 1, order_id: 'ORD-1001', vendor_id: 10, vendor_code: 'VEN-10', status: 'Shipped' };
        pool.query
          .mockResolvedValueOnce([[order]])
          .mockResolvedValueOnce([[{ id: 10, vendor_id: 'VEN-10' }]])
          .mockResolvedValueOnce([{}]);

        await orderController.updateOrderStatus(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          currentStatus: 'Delivered'
        }));
      });
    });

    // Sub-suite: Admin Transitions
    describe('Admin Transitions', () => {
      beforeEach(() => {
        req.user = { id: 99, email: 'admin@veprs.com', role: 'Admin' };
      });

      test('should allow Admin to advance or cancel order', async () => {
        req.params = { id: 1 };
        req.body = { status: 'Cancelled' };
        const order = { id: 1, order_id: 'ORD-1001', status: 'Processing' };
        pool.query
          .mockResolvedValueOnce([[order]])
          .mockResolvedValueOnce([{}]);

        await orderController.updateOrderStatus(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          currentStatus: 'Cancelled'
        }));
      });

      test('should reject invalid status jump for Admin (e.g. Placed -> Delivered)', async () => {
        req.params = { id: 1 };
        req.body = { status: 'Delivered' };
        const order = { id: 1, order_id: 'ORD-1001', status: 'Placed' };
        pool.query.mockResolvedValueOnce([[order]]);

        await orderController.updateOrderStatus(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
      });
    });

    test('should return 403 for unauthorized role', async () => {
      req.user = { id: 50, email: 'auditor@veprs.com', role: 'Guest' };
      req.params = { id: 1 };
      req.body = { status: 'Processing' };
      const order = { id: 1, status: 'Placed' };
      pool.query.mockResolvedValueOnce([[order]]);

      await orderController.updateOrderStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('should return 500 when database error occurs', async () => {
      req.params = { id: 1 };
      req.body = { status: 'Processing' };
      pool.query.mockRejectedValueOnce(new Error('DB failure'));

      await orderController.updateOrderStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // =========================================================================
  // 8. getOrderSources() Helper Tests
  // =========================================================================
  describe('getOrderSources() Helper', () => {
    test('should return requests, quotations, vendors, and recommendations', async () => {
      const mockPRs = [{ id: 1, request_id: 'PR-1001' }];
      const mockQuotes = [{ id: 2, quotation_id: 'QUO-1001' }];
      const mockVendors = [{ id: 10, vendor_name: 'TechLogix' }];
      const mockRecs = [{ recommendation_id: 'REC-1001', rank: 1 }];

      pool.query
        .mockResolvedValueOnce([mockPRs])
        .mockResolvedValueOnce([mockQuotes])
        .mockResolvedValueOnce([mockVendors])
        .mockResolvedValueOnce([mockRecs]);

      await orderController.getOrderSources(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        requests: mockPRs,
        quotations: mockQuotes,
        vendors: mockVendors,
        recommendations: mockRecs
      }));
    });

    test('should return 500 when getOrderSources encounters a DB error', async () => {
      pool.query.mockRejectedValueOnce(new Error('DB failure'));
      await orderController.getOrderSources(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Failed to retrieve order source options.'
      }));
    });
  });
});
