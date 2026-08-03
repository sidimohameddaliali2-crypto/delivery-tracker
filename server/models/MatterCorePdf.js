import mongoose from 'mongoose';

const matterCorePdfSchema = new mongoose.Schema({
  fileKey: String,
  fileUrl: String,
  originalName: String,
  size: Number,
  shareToken: {
    type: String,
    unique: true,
    index: true,
    sparse: true
  },
  viewCount: {
    type: Number,
    default: 0
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

export default mongoose.model('MatterCorePdf', matterCorePdfSchema);
