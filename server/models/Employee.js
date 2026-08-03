import mongoose from 'mongoose';

const leaveBalanceSchema = new mongoose.Schema({
  allocatedDays: { type: Number, required: true },
  usedDays: { type: Number, default: 0 }
}, { _id: false });

const employeeSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: String,
  position: String,
  department: String,
  hireDate: Date,
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    sparse: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  leaveBalances: {
    vacation: {
      type: leaveBalanceSchema,
      default: () => ({ allocatedDays: 21, usedDays: 0 })
    },
    publicHoliday: {
      type: leaveBalanceSchema,
      default: () => ({ allocatedDays: 24, usedDays: 0 })
    },
    sick: {
      type: leaveBalanceSchema,
      default: () => ({ allocatedDays: 10, usedDays: 0 })
    }
  },
  balanceYear: {
    type: Number,
    default: () => new Date().getFullYear()
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

employeeSchema.index({ firstName: 1, lastName: 1 });
employeeSchema.index({ department: 1 });
employeeSchema.index({ status: 1 });

export default mongoose.model('Employee', employeeSchema);
