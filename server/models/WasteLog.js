import mongoose from 'mongoose';

const WASTE_REASONS = ['over-order', 'spoilage', 'returns', 'prep-error'];

const wasteLogSchema = new mongoose.Schema({
  space: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
  deliveryDate: { type: Date, required: true },
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'PartnerMenuItem', required: true },
  itemName: { type: String, required: true }, // snapshot
  quantity: { type: Number, required: true, min: 0 },
  party: { type: String, enum: ['partner', 'matter'], required: true },
  reason: { type: String, enum: WASTE_REASONS, required: true },
  note: { type: String, default: '' },
  createdById: { type: mongoose.Schema.Types.ObjectId },
  createdByModel: { type: String, enum: ['Partner', 'User'] },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

wasteLogSchema.index({ space: 1, deliveryDate: -1 });
wasteLogSchema.index({ party: 1 });
wasteLogSchema.index({ deliveryDate: -1 });

export { WASTE_REASONS };
export default mongoose.model('WasteLog', wasteLogSchema);
