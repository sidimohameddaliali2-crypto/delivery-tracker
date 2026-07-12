import mongoose from 'mongoose';

const partnerMenuItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  mealType: {
    type: String,
    enum: ['breakfast', 'lunch', 'dinner', 'snack'],
    required: true
  },
  description: { type: String, default: '' },
  price: { type: Number, required: true, min: 0 },
  isAvailable: { type: Boolean, default: true },
  availableFrom: { type: Date, default: null },
  availableTo: { type: Date, default: null },
  category: { type: String, default: '' },
  ingredients: { type: [String], default: [] },
  sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

partnerMenuItemSchema.index({ mealType: 1, sortOrder: 1 });

export default mongoose.model('PartnerMenuItem', partnerMenuItemSchema);
