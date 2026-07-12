import mongoose from 'mongoose';

const yellowblockAssetUsageSchema = new mongoose.Schema(
  {
    assetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'YellowblockAsset',
      required: true,
      index: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      default: null,
      index: true,
    },
    eventName: {
      type: String,
      default: '',
      trim: true,
    },
    quantityUsed: {
      type: Number,
      required: true,
      min: 1,
    },
    usedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    usedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    note: {
      type: String,
      default: '',
      trim: true,
    },
    unitPriceSnapshot: {
      type: Number,
      default: 0,
      min: 0,
    },
    unitSnapshot: {
      type: String,
      default: '',
      trim: true,
    },
    materialSnapshot: {
      type: String,
      default: '',
      trim: true,
    },
    placeOfStorageSnapshot: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

yellowblockAssetUsageSchema.index({ assetId: 1, usedAt: -1 });

export default mongoose.model('YellowblockAssetUsage', yellowblockAssetUsageSchema);
