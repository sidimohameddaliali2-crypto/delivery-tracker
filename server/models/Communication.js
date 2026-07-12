import mongoose from 'mongoose';

const CommunicationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['renewal','renewal_outside','new_customer','new_customer_outside'], required: true },
    title: { type: String },
    message: { type: String },
    customerName: { type: String },
    customerId: { type: String },
    city: { type: String },
    outsideDubai: { type: Boolean, default: false },
    renewalStartDate: { type: Date },
    numberOfDays: { type: Number },
    macros: {
      c: { type: String },
      p: { type: String },
      f: { type: String },
      kcal: { type: String }
    },
    mealQuantity: { type: String },
    price: { type: String },
    deliveryFee: { type: String },
    bagDeposit: { type: String },
    paymentMethod: { type: String, enum: ['cash', 'payment_link'], default: 'cash' },
    // New Customer specific fields
    deliveryTiming: { type: String },
    address: { type: String },
    referredBy: { type: String },
    contactNo: { type: String },
    email: { type: String },
    category: { type: String },
    mealPlan: { type: String },
    startDate: { type: Date },
    endDate: { type: Date },
    dislikes: { type: String },
    breakfast: { type: String, enum: ['yes', 'no'] },
    discountRate: { type: String },
    mentions: [{ type: String }], // raw inputs (e.g., @name or Uxxxxxxxx)
    slackText: { type: String },
    sentToSlack: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

CommunicationSchema.index({ createdAt: -1 });
CommunicationSchema.index({ type: 1, createdAt: -1 });

const Communication = mongoose.model('Communication', CommunicationSchema);
export default Communication;
