import mongoose from 'mongoose';

const incidentSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true
    },
    vehicleType: {
      type: String,
      enum: ['bike', 'van'],
      required: true
    },
    incidentType: {
      type: String,
      enum: ['accident', 'not_working'],
      required: true
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500
    },
    status: {
      type: String,
      enum: ['open', 'resolved'],
      default: 'open'
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

incidentSchema.index({ date: 1 });
incidentSchema.index({ vehicleType: 1, incidentType: 1 });

export default mongoose.model('Incident', incidentSchema);
