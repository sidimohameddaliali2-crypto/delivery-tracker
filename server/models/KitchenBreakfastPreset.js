import mongoose from 'mongoose';

const breakfastPresetEntrySchema = new mongoose.Schema({
  breakfastName: { type: String, default: '' },
  C: { type: Number, default: 0 },
  P: { type: Number, default: 0 },
  F: { type: Number, default: 0 },
  V: { type: Number, default: 80 },
  isLargeBreakfast: { type: Boolean, default: false }
}, { _id: false });

const kitchenBreakfastPresetSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    default: 'global'
  },
  breakfastPreset: {
    type: breakfastPresetEntrySchema,
    default: () => ({})
  },
  presetsByName: {
    type: Map,
    of: breakfastPresetEntrySchema,
    default: () => ({})
  }
}, {
  timestamps: true
});

export default mongoose.model('KitchenBreakfastPreset', kitchenBreakfastPresetSchema);
