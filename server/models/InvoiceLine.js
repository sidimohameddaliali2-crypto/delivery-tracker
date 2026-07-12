import mongoose from 'mongoose';

const invoiceLineSchema = new mongoose.Schema({
  invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'PartnerMenuItem' },
  itemName: { type: String, required: true }, // snapshot
  quantity: { type: Number, required: true },
  unitPrice: { type: Number, required: true }, // snapshot sell price
  unitCost: { type: Number, default: 0 },      // snapshot COGS (matter only)
  lineRevenue: { type: Number, required: true },
  lineCost: { type: Number, default: 0 },
  lineMargin: { type: Number, default: 0 }
}, { timestamps: true });

invoiceLineSchema.index({ invoice: 1 });

export default mongoose.model('InvoiceLine', invoiceLineSchema);
