import mongoose from 'mongoose';

const xeroTokenSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  tenantId: { type: String, required: true },
  tenantName: String,
  access_token: { type: String, required: true },
  refresh_token: { type: String, required: true },
  expires_at: { type: Number, required: true } // epoch ms
}, { timestamps: true });

export default mongoose.model('XeroToken', xeroTokenSchema);
