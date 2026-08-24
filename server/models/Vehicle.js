import mongoose from 'mongoose';

const vehicleSchema = new mongoose.Schema(
  {
    vehicleId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true
    },
    type: {
      type: String,
      enum: ['truck', 'van', 'car', 'bike'],
      required: true
    },
    plateNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    assignedDriver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    status: {
      type: String,
      enum: ['active', 'maintenance', 'idle', 'inactive'],
      default: 'idle'
    },
    // Current fuel tank level, 0-100%. Not the same as fuel *efficiency*
    // (km/L) — this app has no odometer/fuel-consumption data to derive
    // real efficiency from, so only tank level is tracked.
    fuelLevel: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500
    }
  },
  {
    timestamps: true
  }
);

vehicleSchema.index({ status: 1 });
vehicleSchema.index({ type: 1 });

export default mongoose.model('Vehicle', vehicleSchema);
