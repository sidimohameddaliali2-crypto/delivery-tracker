import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'manager', 'dispatcher', 'driver', 'store_keeper', 'viewer', 'yellowblock_user', 'kitchen'],
    default: 'viewer'
  },
  profile: {
    firstName: String,
    lastName: String,
    phone: String,
    picture: String,
    department: String,
    position: String,
    status: {
      type: String,
      default: 'offline'
    },
    colorCode: {
      type: String,
      default: '#000000'
    }
  },
  permissions: {
    dashboard: { type: Boolean, default: false },
    users: { type: Boolean, default: false },
    drivers: { type: Boolean, default: false },
    deliveries: { type: Boolean, default: false },
    customers: { type: Boolean, default: false },
    events: { type: Boolean, default: false },
    bags: { type: Boolean, default: false },
    late_deliveries: { type: Boolean, default: false },
    complaints: { type: Boolean, default: false },
    reports: { type: Boolean, default: false },
    delivery_changes: { type: Boolean, default: false },
    menus: { type: Boolean, default: false },
    settings: { type: Boolean, default: false },
    live_map: { type: Boolean, default: false },
    yellowblock: { type: Boolean, default: false }
  },
  location: {
    latitude: Number,
    longitude: Number,
    lastUpdated: Date,
    address: String
  },
  kpi: {
    score: { type: Number, default: 0 },
    avgLateTime: { type: Number, default: 0 },
    accuracyRate: { type: Number, default: 0 },
    complaintsCount: { type: Number, default: 0 }
  },
  dashboardLayout: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// Set default permissions based on role
userSchema.pre('save', function(next) {
  if (this.isModified('role')) {
    this.permissions = getDefaultPermissions(this.role);
  }
  next();
});

function getDefaultPermissions(role) {
  const permissions = {
    dashboard: false,
    users: false,
    drivers: false,
    deliveries: false,
    customers: false,
    events: false,
    bags: false,
    late_deliveries: false,
    complaints: false,
    live_map: false,
    delivery_changes: false,
    reports: false,
    menus: false,
    settings: false,
    yellowblock: false
  };

  switch (role) {
    case 'super_admin':
      Object.keys(permissions).forEach(key => permissions[key] = true);
      break;
    case 'admin':
      permissions.dashboard = true;
      permissions.users = true;
      permissions.drivers = true;
      permissions.deliveries = true;
      permissions.customers = true;
      permissions.events = true;
      permissions.bags = true;
      permissions.late_deliveries = true;
      permissions.complaints = true;
      permissions.live_map = true;
      permissions.delivery_changes = true;
      permissions.reports = true;
      permissions.menus = true;
      break;
    case 'manager':
      permissions.dashboard = true;
      permissions.drivers = true;
      permissions.deliveries = true;
      permissions.customers = true;
      permissions.bags = true;
      permissions.late_deliveries = true;
      permissions.reports = true;
      permissions.live_map = true;
      break;
    case 'dispatcher':
      permissions.dashboard = true;
      permissions.drivers = true;
      permissions.deliveries = true;
      permissions.customers = true;
      permissions.events = true;
      permissions.bags = true;
      permissions.late_deliveries = true;
      permissions.complaints = true;
      permissions.live_map = true;
      break;
    case 'store_keeper':
      permissions.bags = true;
      break;
    case 'driver':
      permissions.dashboard = true;
      permissions.deliveries = true;
      break;
    case 'viewer':
      permissions.dashboard = true;
      permissions.reports = true;
      break;
    case 'yellowblock_user':
      permissions.events = true;
      permissions.yellowblock = true;
      break;
    case 'kitchen':
      // Access is controlled by role-based routing; no standard permissions needed
      break;
  }

  return permissions;
}

export { getDefaultPermissions };
export default mongoose.model('User', userSchema);
