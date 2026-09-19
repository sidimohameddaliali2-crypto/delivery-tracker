import mongoose from 'mongoose';

// A snack item's own fixed macro value (e.g. "Almonds" -> C10 P5 F8), used
// directly wherever that name is assigned — never divided by snacksPerDay,
// unlike the per-date Snack Rotation list's C/P/F (see kitchenListCalculations.js).
const snackPresetEntrySchema = new mongoose.Schema({
  snackName: { type: String, default: '' },
  C: { type: Number, default: 0 },
  P: { type: Number, default: 0 },
  F: { type: Number, default: 0 }
}, { _id: false });

const kitchenSnackPresetSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    default: 'global'
  },
  presetsByName: {
    type: Map,
    of: snackPresetEntrySchema,
    default: () => ({})
  }
}, {
  timestamps: true
});

export default mongoose.model('KitchenSnackPreset', kitchenSnackPresetSchema);
