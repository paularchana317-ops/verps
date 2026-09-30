const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: [true, 'Password is required']
    },
    role: {
      type: String,
      required: [true, 'Role is required'],
      enum: ['Admin', 'User/Requester', 'Vendor', 'admin', 'user', 'vendor'],
      default: 'User/Requester'
    },
    vendorId: {
      type: String,
      default: null
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: 'users',
    timestamps: false
  }
);

// Helper method to format user object safely (excluding password)
userSchema.methods.toSafeObject = function () {
  return {
    id: this._id.toString(),
    _id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    vendorId: this.vendorId,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
