import mongoose from 'mongoose';

const deliverySchema = new mongoose.Schema({
  
  customerId: {
    type: String,
    required: true
  },
  customerName: {
    type: String,
    required: true
  },
  // Change scheduledTime to be within the delivery window
  scheduledTime: {
    type: Date,
    required: true
  },
  deliveredTime: Date,
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null
  },
  company: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
    default: 'Matter'
  },
  otherCompany: String,
  type: {
    type: String,
    enum: ['Delivery', 'Task', 'Collection'],
    default: 'Delivery'
  },
  taskType: {
    type: String,
    enum: ['Bag Collection', 'Purchase', 'Inspection'],
    required: false
  },
  address: String,
  addressDetails: {
    city: String,
    area: String,
    street: String,
    building: String,
    floor: String,
    apartment: String
  },
  notes: String,
  zone: {
    type: String,
    required: false
  },
  gpsLocation: {
    lat: Number,
    lng: Number,
    link: String
  },
   bagAssignment: {
    bagId: {
      type: String,
      required: false
    },
    assignedAt: {
      type: Date,
      required: false
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },
    returnedAt: {
      type: Date,
      required: false
    },
    status: {
      type: String,
      enum: ['assigned', 'delivered', 'returned'],
      default: 'assigned'
    }
  },
  status: {
    type: String,
    enum: ['pending', 'assigned', 'on_route', 'picked_up', 'delivered', 'failed', 'completed', 'collected'],
    default: 'pending'
  },
  collectionDetails: {
    bagIds: [String],
    collectedAt: Date,
    collectedPhotoUrl: String,
    noBagsAvailable: {
      type: Boolean,
      default: false
    }
  },
  completedAt: Date,
  lateMinutes: {
    type: Number,
    default: 0
  },
  earlyMinutes: {
  type: Number,
  default: 0
},
deliveryType: {
  type: String,
  enum: ['early', 'on-time', 'late'],
  default: 'on-time'
},
   proof: {
    images: [String], // This should store URLs, not base64
    photoUrl: String, // Primary photo URL (kept in sync with images[0])
    signature: String,
    bagId: String,
    timestamp: Date,
    location: {
      lat: Number,
      lng: Number,
      address: String
    },
    notes: String,
    verified: Boolean,
    deliveryMethod: String
  },
    
  timeline: [{
    status: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    notes: String
  }],
  complaint: {
    hasComplaint: { type: Boolean, default: false },
    details: String,
    complaintType: String,
    remarks: String,
    resolved: { type: Boolean, default: false },
    reportedAt: { type: Date },
    compensation: {
      type: { type: String, enum: ['refund', 'extra_day'], required: false },
      amount: { type: Number, required: false },
      days: { type: Number, required: false }
    }
  },
  
}, {
  timestamps: true
});

// Index for better query performance
deliverySchema.index({ scheduledTime: 1 });
deliverySchema.index({ driver: 1, status: 1 });
deliverySchema.index({ customerId: 1 });
deliverySchema.index({ driver: 1, scheduledTime: 1 }); // For getDriverTodaysDeliveries query
deliverySchema.index({ company: 1, zone: 1 }); // For bulk filtering by company/zone
deliverySchema.index({ status: 1, scheduledTime: 1 }); // For status queries with time range

deliverySchema.methods.updateStatus = async function (status, notes, location) {
  this.status = status;

  if (status === 'delivered') {
    this.deliveredTime = new Date();
  }

  const parsedLocation =
    typeof location === 'string'
      ? (() => {
          try {
            return JSON.parse(location);
          } catch (error) {
            return null;
          }
        })()
      : location;

  this.timeline.push({
    status,
    notes,
    timestamp: new Date(),
  });

  if (parsedLocation && typeof parsedLocation === 'object') {
    this.gpsLocation = {
      lat: parsedLocation.latitude ?? parsedLocation.lat ?? null,
      lng: parsedLocation.longitude ?? parsedLocation.lng ?? null,
      link: parsedLocation.link ?? this.gpsLocation?.link ?? null,
    };
  }

  return this.save();
};

deliverySchema.statics.getDriverTodaysDeliveries = function (driverId) {
  // Use environment variable for timezone offset (UAE = UTC+4 = 240 minutes)
  const TIMEZONE_OFFSET_MINUTES = parseInt(process.env.LOCAL_TIMEZONE_OFFSET_MINUTES || '240', 10);
  const uaeOffset = TIMEZONE_OFFSET_MINUTES * 60 * 1000; // Convert to milliseconds
  
  const nowUTC = new Date();
  const nowUAE = new Date(nowUTC.getTime() + uaeOffset);
  
  // Get today's date string in UAE timezone (YYYY-MM-DD)
  const todayStringUAE = nowUAE.toISOString().split('T')[0];
  
  // Convert UAE midnight to UTC for database query
  const uaeMidnight = new Date(todayStringUAE + 'T00:00:00.000Z');
  const startOfDay = new Date(uaeMidnight.getTime() - uaeOffset); // Convert back to UTC
  let endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1); // 23:59:59 UTC

  // Env-based controls for next-day visibility
  const ENABLE_EARLY_NEXT_DAY = String(process.env.ENABLE_EARLY_NEXT_DAY || '1') === '1';
  const NEXT_DAY_AVAILABLE_HOUR = parseInt(process.env.NEXT_DAY_AVAILABLE_HOUR || '16', 10);

  // If enabled and local time >= cutoff hour, include tomorrow's deliveries as available
  // Extend the query window to end of tomorrow
  if (ENABLE_EARLY_NEXT_DAY && nowUAE.getHours() >= NEXT_DAY_AVAILABLE_HOUR) {
    endOfDay = new Date(startOfDay.getTime() + 48 * 60 * 60 * 1000 - 1); // end of tomorrow (UTC)
  }

  console.log('📅 getDriverTodaysDeliveries:', {
    driverId: driverId.toString().substring(0, 8),
    TIMEZONE_OFFSET_MINUTES,
    nowUTC: nowUTC.toISOString(),
    nowUAE: nowUAE.toISOString(),
    todayStringUAE,
    startOfDay: startOfDay.toISOString(),
    endOfDay: endOfDay.toISOString()
  });

  return this.find({
    driver: driverId,
    scheduledTime: {
      $gte: startOfDay,
      $lte: endOfDay
    },
    status: { $in: ['pending', 'assigned', 'on_route', 'picked_up', 'delivered', 'failed', 'completed'] }
  }).sort({ scheduledTime: 1 });
};

export default mongoose.model('Delivery', deliverySchema);
