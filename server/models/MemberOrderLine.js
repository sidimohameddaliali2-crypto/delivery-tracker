import mongoose from 'mongoose';

// Mirrors OrderLine.js — no price on the line, resolved live from SpacePrice.
const memberOrderLineSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'MemberOrder', required: true },
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'PartnerMenuItem', required: true },
  quantity: { type: Number, required: true, min: 0 }
}, { timestamps: true });

memberOrderLineSchema.index({ order: 1, menuItem: 1 }, { unique: true });
memberOrderLineSchema.index({ order: 1 });

export default mongoose.model('MemberOrderLine', memberOrderLineSchema);
