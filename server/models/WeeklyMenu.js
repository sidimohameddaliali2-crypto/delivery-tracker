import mongoose from 'mongoose';

const breakfastPresetSchema = new mongoose.Schema({
  breakfastName: { type: String, default: '' },
  C: { type: Number, default: 0 },
  P: { type: Number, default: 0 },
  F: { type: Number, default: 0 },
  V: { type: Number, default: 80 },
  isLargeBreakfast: { type: Boolean, default: false }
}, { _id: false });

const snackOptionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  // Ingredient/allergen tags this snack contains (e.g. "Dairy", "Nuts") —
  // matched against the customer's exclusion list, not the snack's name.
  exclusions: { type: [String], default: [] },
  C: { type: Number, default: 0 },
  P: { type: Number, default: 0 },
  F: { type: Number, default: 0 }
}, { _id: false });

const mainMealOptionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['chicken', 'beef', 'fish'], required: true },
  exclusions: { type: [String], default: [] }
}, { _id: false });

const weeklyMenuSchema = new mongoose.Schema({
  // Menu info
  title: {
    type: String,
    required: true
  },
  description: String,
  
  // Week range
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  
  // Menu items organized by day and meal type
  meals: [{
    date: Date,
    mealType: {
      type: String,
      enum: ['breakfast', 'lunch', 'dinner', 'snack']
    },
    items: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MenuItem'
    }]
  }],
  
  // Meal plans included
  mealPlans: [{
    type: String,
    enum: ['Standard', 'Customized', 'Premium', 'Vegan', 'Keto', 'Paleo', 'Bodybuilder', 'Lean 2 Meal', 'Lean 3 Meal', 'Thrive 2 Meal', 'Thrive 3 Meal', 'Perform 2 Meal', 'Perform 3 Meal']
  }],
  
  // Sharing
  shareLink: {
    token: {
      type: String,
      unique: true,
      index: true
    },
    createdAt: Date,
    expiresAt: Date,
    isActive: {
      type: Boolean,
      default: true
    }
  },
  
  // Status
  isPublished: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Per-day selection deadlines
  // e.g. for Monday delivery, lock selections by Friday 23:59
  selectionDeadlines: [{
    deliveryDay: {
      type: String,
      enum: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    },
    // How many days before the delivery day the deadline falls
    // e.g. 3 means the deadline is 3 days before the delivery date
    daysBefore: {
      type: Number,
      default: 3
    },
    // Time of day for the deadline in HH:MM (24h)
    deadlineTime: {
      type: String,
      default: '23:59'
    }
  }],

  // Completion Message
  enableCompletionMessage: {
    type: Boolean,
    default: false
  },
  completionMessage: {
    type: String,
    default: 'Your meal selections have been saved successfully.'
  },

  // Kitchen list breakfast presets imported from CSV/Excel.
  breakfastPreset: {
    type: breakfastPresetSchema,
    default: () => ({})
  },
  breakfastPresetsByName: {
    type: Map,
    of: breakfastPresetSchema,
    default: () => ({})
  },

  // Kitchen-defined snack ingredient options per date (YYYY-MM-DD keys).
  // The customer never chooses these — they're auto-assigned at random,
  // excluding anything on the customer's exclusion list.
  snackOptionsByDate: {
    type: Map,
    of: [snackOptionSchema],
    default: () => ({})
  },

  // Kitchen-defined main meal rotation per date: up to 3 primary options
  // cycled through in order (not random), plus a fallback pool used only
  // when a customer's exclusions rule out all 3 primary options.
  mainMealOptionsByDate: {
    type: Map,
    of: {
      mainMeals: { type: [mainMealOptionSchema], default: [] },
      subMeals: { type: [mainMealOptionSchema], default: [] }
    },
    default: () => ({})
  },

  // Analytics
  viewCount: {
    type: Number,
    default: 0
  },
  selectionCount: {
    type: Number,
    default: 0
  },
  
  // Tracking
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

weeklyMenuSchema.index({ startDate: 1, endDate: 1 });
weeklyMenuSchema.index({ 'shareLink.token': 1 });
weeklyMenuSchema.index({ isActive: 1, isPublished: 1 });

export default mongoose.model('WeeklyMenu', weeklyMenuSchema);
