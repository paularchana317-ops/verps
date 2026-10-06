const mongoose = require('mongoose');

const evaluationSchema = new mongoose.Schema(
  {
    evaluation_id: {
      type: String,
      required: true,
      unique: true,
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
    quotation_id: {
      type: String,
      default: null,
      trim: true
    },
    evaluator_id: {
      type: String,
      required: true,
      trim: true
    },
    evaluator_name: {
      type: String,
      required: true,
      trim: true
    },
    price_score: {
      type: Number,
      required: [true, 'Price score is required'],
      min: [0, 'Price score must be between 0 and 100'],
      max: [100, 'Price score must be between 0 and 100']
    },
    quality_score: {
      type: Number,
      required: [true, 'Quality score is required'],
      min: [0, 'Quality score must be between 0 and 100'],
      max: [100, 'Quality score must be between 0 and 100']
    },
    delivery_score: {
      type: Number,
      required: [true, 'Delivery score is required'],
      min: [0, 'Delivery score must be between 0 and 100'],
      max: [100, 'Delivery score must be between 0 and 100']
    },
    overall_score: {
      type: Number,
      required: [true, 'Overall score is required'],
      min: [0, 'Overall score must be between 0 and 100'],
      max: [100, 'Overall score must be between 0 and 100']
    },
    feedback: {
      type: String,
      default: null,
      trim: true
    },
    status: {
      type: String,
      default: 'Completed'
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
    collection: 'evaluations',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
  }
);

module.exports = mongoose.models.Evaluation || mongoose.model('Evaluation', evaluationSchema);
