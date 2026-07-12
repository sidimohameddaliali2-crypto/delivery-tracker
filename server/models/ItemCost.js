import mongoose from 'mongoose';

// Matter internal COGS per item — never exposed to partners.
const itemCostSchema = new mongoose.Schema({
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'PartnerMenuItem', required: true },
  cost: { type: Number, required: true, min: 0 },
  effectiveFrom: { type: Date, default: Date.now }
}, { timestamps: true });

itemCostSchema.index({ menuItem: 1, effectiveFrom: -1 });

export default mongoose.model('ItemCost', itemCostSchema);
