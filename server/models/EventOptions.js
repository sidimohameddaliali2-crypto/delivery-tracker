import mongoose from 'mongoose';

const eventOptionsSchema = new mongoose.Schema(
  {
    company: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    equipment: [
      {
        name: { type: String, required: true },
        dimensions: { type: String, default: '' },
        description: { type: String, default: '' }
      }
    ],
    food: [
      {
        name: { type: String, required: true },
        description: { type: String, default: '' }
      }
    ]
  },
  { timestamps: true }
);

export default mongoose.model('EventOptions', eventOptionsSchema);
