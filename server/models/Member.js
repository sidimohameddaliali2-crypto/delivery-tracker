import mongoose from 'mongoose';

// A Member is a passwordless sub-account of a Partner. Clients join by scanning
// the partner's QR / invite link and self-register with name + email + exclusions.
const memberSchema = new mongoose.Schema({
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true, index: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  // comma-joined free text — same convention as Customer.mealExclusion (no enum server-side)
  dietaryExclusions: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  lastLogin: Date
}, { timestamps: true });

// Same email may belong to more than one partner, but only once per partner.
memberSchema.index({ partner: 1, email: 1 }, { unique: true });

export default mongoose.model('Member', memberSchema);
