import mongoose from 'mongoose';

const spaceOrderSchema = new mongoose.Schema({
  space: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
  deliveryDate: { type: Date, required: true },
  status: { type: String, enum: ['draft', 'submitted', 'locked', 'cancelled'], default: 'draft' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner' },
  submittedAt: Date,
  lockedAt: Date,
  notes: { type: String, default: '' },
  deliveryTime: { type: String, default: null },
  orderType: { type: String, enum: ['single', 'weekly'], default: 'single' },
  weekGroupId: { type: String, default: null }
}, { timestamps: true });

spaceOrderSchema.index({ space: 1, deliveryDate: 1 });
spaceOrderSchema.index({ status: 1, deliveryDate: 1 });

// Helpers used in routes — export alongside model
export const lockCutoff = (deliveryDate) => {
  const d = new Date(deliveryDate);
  d.setDate(d.getDate() - 2);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const isInLockWindow = (deliveryDate) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now >= lockCutoff(deliveryDate);
};

export default mongoose.model('SpaceOrder', spaceOrderSchema);
