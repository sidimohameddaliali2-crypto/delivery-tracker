import mongoose from 'mongoose';

const thirdPartyDeliveryCompanySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      index: true,
    },
    logoUrl: {
      type: String,
      required: true,
      trim: true,
    },
    whatsappNumber: {
      type: String,
      default: '',
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('ThirdPartyDeliveryCompany', thirdPartyDeliveryCompanySchema);
