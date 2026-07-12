import mongoose from 'mongoose';

const partnerOrderSchema = new mongoose.Schema({
  partner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner',
    required: true,
    index: true
  },
  weeklyMenu: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WeeklyMenu'
  },
  items: [{
    partnerMenuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'PartnerMenuItem' },
    mealName: String,
    mealType: String,
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true }
  }],
  totalAmount: { type: Number, required: true },
  deliveryDate: Date,
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'delivered', 'cancelled'],
    default: 'pending'
  },
  invoiceNumber: { type: String, unique: true },
  notes: { type: String, default: '' }
}, { timestamps: true });

partnerOrderSchema.pre('save', async function (next) {
  if (!this.invoiceNumber) {
    const year = new Date().getFullYear();
    const count = await this.constructor.countDocuments();
    this.invoiceNumber = `INV-${year}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

partnerOrderSchema.index({ partner: 1, createdAt: -1 });
partnerOrderSchema.index({ status: 1 });
partnerOrderSchema.index({ deliveryDate: 1 });

export default mongoose.model('PartnerOrder', partnerOrderSchema);
