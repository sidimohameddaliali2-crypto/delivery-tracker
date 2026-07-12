import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const partnerSchema = new mongoose.Schema({
  businessName: { type: String, required: true, trim: true },
  businessType: {
    type: String,
    enum: ['cafe', 'gym', 'restaurant', 'other'],
    required: true
  },
  contactName: { type: String, required: true, trim: true },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: { type: String, required: true, select: false },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  minimumOrder: { type: Number, default: 0, min: 0 },
  defaultDeliveryTime: { type: String, default: null },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastLogin: Date
}, { timestamps: true });

partnerSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

partnerSchema.methods.correctPassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model('Partner', partnerSchema);
