import mongoose from 'mongoose';

const storeKeeperScanSchema = new mongoose.Schema(
  {
    bagId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true
    },
    action: {
      type: String,
      enum: ['assign_scan', 'return_scan', 'status_check', 'scan'],
      required: true,
      index: true
    },
    result: {
      type: String,
      default: null
    },
    detail: {
      type: String,
      default: null
    },
    source: {
      type: String,
      default: 'store_keeper',
      index: true
    },
    dateKey: {
      type: String,
      index: true
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    scannedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    scannedByName: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

storeKeeperScanSchema.pre('validate', function(next) {
  const ts = this.timestamp instanceof Date ? this.timestamp : new Date(this.timestamp || Date.now());
  const y = ts.getFullYear();
  const m = String(ts.getMonth() + 1).padStart(2, '0');
  const d = String(ts.getDate()).padStart(2, '0');
  this.dateKey = `${y}-${m}-${d}`;
  next();
});

storeKeeperScanSchema.index({ source: 1, dateKey: 1, timestamp: -1 });

export default mongoose.model('StoreKeeperScan', storeKeeperScanSchema);
