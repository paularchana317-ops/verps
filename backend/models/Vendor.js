const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema(
  {
    vendor_id: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    vendor_name: {
      type: String,
      required: [true, 'Vendor Name is required'],
      trim: true
    },
    contact_person: {
      type: String,
      required: [true, 'Contact Person is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true
    },
    city: {
      type: String,
      default: '',
      trim: true
    },
    state: {
      type: String,
      default: '',
      trim: true
    },
    product_categories: {
      type: String,
      default: 'Computer Accessories',
      trim: true
    },
    business_registration_number: {
      type: String,
      default: null,
      trim: true
    },
    description: {
      type: String,
      default: null,
      trim: true
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active'
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: 'vendors',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
  }
);

module.exports = mongoose.models.Vendor || mongoose.model('Vendor', vendorSchema);
