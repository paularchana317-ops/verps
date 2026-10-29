const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  feedback_id: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  user_id: {
    type: String,
    required: true
  },
  user_name: {
    type: String,
    required: true,
    trim: true
  },
  user_email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  vendor_id: {
    type: String,
    required: true
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
  order_id: {
    type: String,
    default: null
  },
  order_code: {
    type: String,
    default: null
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comments: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    default: 'General',
    trim: true
  },
  status: {
    type: String,
    default: 'Active',
    enum: ['Active', 'Hidden', 'Archived']
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

// Index for high-performance querying
feedbackSchema.index({ vendor_id: 1, rating: -1 });
feedbackSchema.index({ user_id: 1 });
feedbackSchema.index({ feedback_id: 1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
