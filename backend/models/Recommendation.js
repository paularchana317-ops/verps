const mongoose = require('mongoose');

const recommendationSchema = new mongoose.Schema(
  {
    recommendation_id: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    vendor_id: {
      type: String,
      required: true,
      trim: true
    },
    vendor_code: {
      type: String,
      required: true,
      trim: true
    },
    vendor_name: {
      type: String,
      required: true,
      trim: true
    },
    overall_score: {
      type: Number,
      required: true
    },
    price_score: {
      type: Number,
      required: true
    },
    quality_score: {
      type: Number,
      required: true
    },
    delivery_score: {
      type: Number,
      required: true
    },
    rank: {
      type: Number,
      default: 1
    },
    product_categories: {
      type: String,
      default: 'Computer Accessories'
    },
    city: {
      type: String,
      default: ''
    },
    state: {
      type: String,
      default: ''
    },
    summary: {
      type: String,
      default: null
    },
    status: {
      type: String,
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
    collection: 'recommendations',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
  }
);

module.exports = mongoose.models.Recommendation || mongoose.model('Recommendation', recommendationSchema);
