import mongoose from 'mongoose';

const orderLineSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'SpaceOrder', required: true },
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'PartnerMenuItem', required: true },
  quantity: { type: Number, required: true, min: 0 }
}, { timestamps: true });

orderLineSchema.index({ order: 1, menuItem: 1 }, { unique: true });
orderLineSchema.index({ order: 1 });

export default mongoose.model('OrderLine', orderLineSchema);
