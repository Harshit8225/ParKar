'use strict';

const mongoose = require('mongoose');

/**
 * Business profile of a parking operator. Login credentials live in `users`
 * (role: owner); this collection holds only the operator-specific details.
 */
const parkingOwnerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    businessName: { type: String, required: true, trim: true, maxlength: 160 },
    contactEmail: { type: String, lowercase: true, trim: true },
    contactPhone: { type: String, trim: true },
    gstNumber: { type: String, trim: true, uppercase: true },
    address: { type: String, trim: true },
    payoutDetails: {
      accountHolder: { type: String, trim: true },
      accountNumberLast4: { type: String, trim: true, maxlength: 4 },
      ifsc: { type: String, trim: true, uppercase: true },
    },
    isVerified: { type: Boolean, default: false, index: true },
    verifiedAt: { type: Date },
    lotCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

module.exports = mongoose.model('ParkingOwner', parkingOwnerSchema, 'parkingOwners');
