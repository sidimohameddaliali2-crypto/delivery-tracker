import mongoose from 'mongoose';

// Member orders live in their own collection — isolated from the partner
// SpaceOrder / Invoice / admin-lock pipeline. The 2-day advance lock helpers
// are reused from SpaceOrder.js (do not redefine them).
const memberOrderSchema = new mongoose.Schema({
  member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true, index: true },
  deliveryDate: { type: Date, required: true },
  status: { type: String, enum: ['draft', 'submitted', 'locked', 'cancelled'], default: 'draft' },
  submittedAt: Date,
  lockedAt: Date,
  cancelledAt: Date,
  notes: { type: String, default: '' },
  deliveryTime: { type: String, default: null }
}, { timestamps: true });

memberOrderSchema.index({ member: 1, deliveryDate: 1 });

export default mongoose.model('MemberOrder', memberOrderSchema);
