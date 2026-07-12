import mongoose from 'mongoose';

const deliveryIssueSchema = new mongoose.Schema(
  {
    customerId: {
      type: String,
      required: true,
      trim: true
    },
    customerName: {
      type: String,
      required: true,
      trim: true
    },
    issueType: {
      type: String,
      enum: ['wrong_item', 'missing_item', 'late_delivery', 'damaged', 'not_delivered', 'other'],
      required: true
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    photoUrl: {
      type: String,
      trim: true
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    status: {
      type: String,
      enum: ['open', 'resolved'],
      default: 'open'
    },
    resolvedAt: {
      type: Date
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    resolvedByName: {
      type: String,
      trim: true
    },
    resolvedNotes: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reportedByName: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

deliveryIssueSchema.index({ customerId: 1 });
deliveryIssueSchema.index({ status: 1 });
deliveryIssueSchema.index({ createdAt: -1 });

export default mongoose.model('DeliveryIssue', deliveryIssueSchema);
