import mongoose from 'mongoose';

const bagNoteSchema = new mongoose.Schema(
  {
    customerId: {
      type: String,
      required: true,
      trim: true
    },
    customerName: {
      type: String,
      trim: true
    },
    bagId: {
      type: String,
      trim: true
    },
    date: {
      type: Date,
      required: true
    },
    note: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdByName: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

bagNoteSchema.index({ customerId: 1, date: 1 });
bagNoteSchema.index({ date: 1 });

export default mongoose.model('BagNote', bagNoteSchema);
