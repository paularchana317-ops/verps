const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    order_id: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    user_id: {
      type: String,
      required: [true, 'User ID is required'],
      trim: true
    },
    user_name: {
      type: String,
      required: [true, 'User Name is required'],
      trim: true
    },
    user_email: {
      type: String,
      required: [true, 'User Email is required'],
      lowercase: true,
      trim: true
    },
    vendor_id: {
      type: String,
      required: [true, 'Vendor ID is required'],
      trim: true
    },
    vendor_code: {
      type: String,
      required: true,
      trim: true
    },
    vendor_name: {
      type: String,
      required: [true, 'Vendor Name is required'],
      trim: true
    },
    purchase_request_id: {
      type: String,
      default: null
    },
    purchase_request_code: {
      type: String,
      default: null
    },
    quotation_id: {
      type: String,
      default: null
    },
    quotation_code: {
      type: String,
      default: null
    },
    product_name: {
      type: String,
      required: [true, 'Product Name is required'],
      trim: true
    },
    product_category: {
      type: String,
      default: 'Computer Accessories',
      trim: true
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1']
    },
    unit_price: {
      type: Number,
      required: [true, 'Unit Price is required'],
      min: [0, 'Unit Price cannot be negative']
    },
    total_price: {
      type: Number,
      required: [true, 'Total Price is required'],
      min: [0, 'Total Price cannot be negative']
    },
    delivery_address: {
      type: String,
      required: [true, 'Delivery Address is required'],
      trim: true
    },
    contact_phone: {
      type: String,
      default: null,
      trim: true
    },
    notes: {
      type: String,
      default: null,
      trim: true
    },
    status: {
      type: String,
      required: true,
      enum: ['Placed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
      default: 'Placed'
    },
    status_history: [
      {
        status: { type: String, required: true },
        updated_by: { type: String, required: true },
        updated_by_role: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        comment: { type: String, default: null }
      }
    ],
    created_at: {
      type: Date,
      default: Date.now
    },
    updated_at: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: 'orders',
    timestamps: false
  }
);

// Format helper
orderSchema.methods.toSafeObject = function () {
  return {
    id: this._id.toString(),
    order_id: this.order_id,
    user_id: this.user_id,
    user_name: this.user_name,
    user_email: this.user_email,
    vendor_id: this.vendor_id,
    vendor_code: this.vendor_code,
    vendor_name: this.vendor_name,
    purchase_request_id: this.purchase_request_id,
    purchase_request_code: this.purchase_request_code,
    quotation_id: this.quotation_id,
    quotation_code: this.quotation_code,
    product_name: this.product_name,
    product_category: this.product_category,
    quantity: this.quantity,
    unit_price: this.unit_price,
    total_price: this.total_price,
    delivery_address: this.delivery_address,
    contact_phone: this.contact_phone,
    notes: this.notes,
    status: this.status,
    status_history: this.status_history,
    created_at: this.created_at,
    updated_at: this.updated_at
  };
};

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
