import mongoose from 'mongoose';

const flaggedAlertSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  customerName: { type: String },
  customerId: { type: String },
  lastSent: { type: Date, default: null }
}, { timestamps: true });

export default mongoose.model('FlaggedAlert', flaggedAlertSchema);
