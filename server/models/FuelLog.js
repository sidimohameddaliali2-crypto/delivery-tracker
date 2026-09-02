import mongoose from 'mongoose';

/**
 * A single petrol/fuel purchase logged against a vehicle. Kept in its own
 * collection (rather than an array on Vehicle) so history is unbounded and
 * easy to query/aggregate for spend reports.
 */
const fuelLogSchema = new mongoose.Schema(
  {
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true,
      index: true
    },
    // When the fuel was purchased (defaults to now).
    date: {
      type: Date,
      default: Date.now,
      index: true
    },
    // Money spent on this fill-up.
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'AED',
      trim: true,
      uppercase: true
    },
    // Optional extra detail.
    liters: {
      type: Number,
      min: 0,
      default: null
    },
    odometer: {
      type: Number,
      min: 0,
      default: null
    },
    station: {
      type: String,
      trim: true,
      maxlength: 120
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500
    },
    // Who recorded the entry.
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

fuelLogSchema.index({ vehicle: 1, date: -1 });

export default mongoose.model('FuelLog', fuelLogSchema);
