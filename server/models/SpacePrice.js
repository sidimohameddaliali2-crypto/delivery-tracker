import mongoose from 'mongoose';

// Per-space sell price for a menu item. Each write creates a new record;
// the current price is the most recent effectiveFrom ≤ now.
const spacePriceSchema = new mongoose.Schema({
  space: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'PartnerMenuItem', required: true },
  price: { type: Number, required: true, min: 0 },
  effectiveFrom: { type: Date, default: Date.now }
}, { timestamps: true });

spacePriceSchema.index({ space: 1, menuItem: 1, effectiveFrom: -1 });

export default mongoose.model('SpacePrice', spacePriceSchema);
