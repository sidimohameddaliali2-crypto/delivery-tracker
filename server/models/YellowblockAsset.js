import mongoose from 'mongoose';

const assetUsageSnapshotSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      default: null,
    },
    eventName: {
      type: String,
      default: '',
      trim: true,
    },
    quantityUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
    usedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    usedAt: {
      type: Date,
      default: Date.now,
    },
    note: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false }
);

const yellowblockAssetSchema = new mongoose.Schema(
  {
    imageUrl: {
      type: String,
      default: '',
      trim: true,
    },
    itemType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    unit: {
      type: String,
      required: true,
      trim: true,
    },
    material: {
      type: String,
      default: '',
      trim: true,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    totalCountUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalCountAvailable: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    placeOfStorage: {
      type: String,
      default: '',
      trim: true,
    },
    companyName: {
      type: String,
      default: 'Yellow Block',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    usageLogs: [assetUsageSnapshotSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

yellowblockAssetSchema.index({ itemType: 1, companyName: 1, isActive: 1 });

export default mongoose.model('YellowblockAsset', yellowblockAssetSchema);
