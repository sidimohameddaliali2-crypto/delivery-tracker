import mongoose from 'mongoose';

const spaceMenuSchema = new mongoose.Schema({
  space: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'PartnerMenuItem', required: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

spaceMenuSchema.index({ space: 1, menuItem: 1 }, { unique: true });
spaceMenuSchema.index({ space: 1, isActive: 1 });

export default mongoose.model('SpaceMenu', spaceMenuSchema);
