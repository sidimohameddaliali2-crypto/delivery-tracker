import mongoose from 'mongoose';

const webhookEventSchema = new mongoose.Schema({
  source: {
    type: String,
    default: 'external-customer-portal'
  },
  eventType: {
    type: String,
    default: 'unknown'
  },
  customerIdentifier: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  rawPayload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  receivedAt: {
    type: Date,
    default: Date.now
  },
  processed: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

webhookEventSchema.index({ receivedAt: -1 });
webhookEventSchema.index({ eventType: 1, receivedAt: -1 });

export default mongoose.model('WebhookEvent', webhookEventSchema);
