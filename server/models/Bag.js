import mongoose from 'mongoose';

const bagSchema = new mongoose.Schema({
  bagId: {
    type: String,
    required: [true, 'Bag ID is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  status: {
    type: String,
    enum: ['available', 'assigned', 'in_use', 'maintenance', 'retired'],
    default: 'available'
  },
  bagType: {
    type: String,
    enum: ['standard', 'on_time_use'],
    default: 'standard'
  },
  returnLocation: {
    lat: Number,
    lng: Number,
    accuracy: Number
  },
  returnedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  returnedByName: String,
  returnedAt: Date,
  condition: {
    type: String,
    enum: ['excellent', 'good', 'fair', 'poor'],
    default: 'good'
  },
  location: {
    type: String,
    enum: ['warehouse', 'driver', 'customer'],
    default: 'warehouse'
  },
  assignedTo: {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    assignedByName: String,
    customer: {
      customerId: String,
      customerName: String
    },
    assignmentTime: Date,
    expectedReturn: Date
  },
  currentDelivery: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Delivery'
  },
  lastMaintenance: Date,
  maintenanceNotes: String,
  purchaseDate: Date,
  expectedLifespan: Number, // in months
  qrCode: String,
  notes: String,
  isActive: {
    type: Boolean,
    default: true
  },
  quantity: {
    type: Number,
    default: 1,
    min: 1
  },
  isFlagged: {
    type: Boolean,
    default: false
  },
  flagReason: String,
  flaggedAt: Date,
  quantityHistory: [{
    oldQuantity: Number,
    newQuantity: Number,
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    changedByName: String,
    reason: String,
    note: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  history: [{
    eventType: String,
    status: String,
    location: String,
    assignedBy: {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      name: String
    },
    assignedTo: {
      driver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      driverName: String,
      customer: {
        customerId: String,
        customerName: String
      }
    },
    notes: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes
bagSchema.index({ bagId: 1 });
bagSchema.index({ status: 1 });
bagSchema.index({ location: 1 });
bagSchema.index({ 'assignedTo.driver': 1 });
bagSchema.index({ currentDelivery: 1 });

// Static method to get available bags
bagSchema.statics.getAvailableBags = function() {
  return this.find({
    status: 'available',
    isActive: true
  });
};

// Add to history when status changes
bagSchema.pre('save', function(next) {
  if (this.isModified('status') || this.isModified('location') || this.isModified('assignedTo')) {
    const overrideEntry = this.$locals && this.$locals.historyEntryOverride;
    if (overrideEntry) {
      this.history.push(overrideEntry);
      delete this.$locals.historyEntryOverride;
      if (this.$locals) {
        delete this.$locals.historyNote;
      }
      return next();
    }

    const historyNote =
      (this.$locals && this.$locals.historyNote) || 'Status updated';
    this.history.push({
      status: this.status,
      location: this.location,
      assignedBy: {
        user: this.assignedTo?.assignedBy,
        name: this.assignedTo?.assignedByName,
      },
      assignedTo: this.assignedTo,
      notes: historyNote
    });
    if (this.$locals) {
      delete this.$locals.historyNote;
    }
  }
  next();
});

// Static method to get bags assigned to driver
bagSchema.statics.getDriverBags = function(driverId) {
  return this.find({
    'assignedTo.driver': driverId,
    isActive: true
  }).populate('assignedTo.driver', 'profile firstName lastName');
};

// Instance method to assign bag
bagSchema.methods.assignToDriver = function(driverId, deliveryId = null) {
  this.status = deliveryId ? 'in_use' : 'assigned';
  this.location = 'driver';
  this.assignedTo = {
    driver: driverId,
    assignmentTime: new Date()
  };
  this.currentDelivery = deliveryId;
  return this.save();
};

// Instance method to return bag
bagSchema.methods.returnToWarehouse = function(meta = {}) {
  const {
    returnedBy,
    returnedByName,
    location,
    notes,
    returnedAt,
    historyNote,
  } = meta || {};

  const resolvedReturnedAt =
    returnedAt instanceof Date ? returnedAt : new Date();

  this.status = 'available';
  this.location = 'warehouse';
  this.assignedTo = undefined;
  this.currentDelivery = undefined;
  this.returnedAt = resolvedReturnedAt;

  if (returnedBy) {
    this.returnedBy = returnedBy;
  } else {
    this.returnedBy = undefined;
  }

  if (returnedByName) {
    this.returnedByName = returnedByName;
  } else {
    this.returnedByName = undefined;
  }

  if (location && typeof location === 'object') {
    const lat =
      typeof location.lat === 'number'
        ? location.lat
        : typeof location.latitude === 'number'
        ? location.latitude
        : undefined;
    const lng =
      typeof location.lng === 'number'
        ? location.lng
        : typeof location.longitude === 'number'
        ? location.longitude
        : undefined;
    const accuracy =
      typeof location.accuracy === 'number'
        ? location.accuracy
        : typeof location.precision === 'number'
        ? location.precision
        : undefined;

    if (typeof lat === 'number' && typeof lng === 'number') {
      this.returnLocation = {
        lat,
        lng,
        accuracy,
      };
    }
  } else if (location === null) {
    this.returnLocation = undefined;
  }

  if (typeof notes === 'string' && notes.trim()) {
    this.notes = notes.trim();
  }

  if (!this.$locals) {
    this.$locals = {};
  }
  this.$locals.historyNote = historyNote || 'Bag returned to warehouse';

  return this.save();
};

export default mongoose.model('Bag', bagSchema);
