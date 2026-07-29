import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema({
  // Basic information
  customerId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  email: {
    type: String,
    sparse: true,
    index: true
  },
  cpf: {
    type: String,
    sparse: true,
    index: true
  },
  firstName: String,
  lastName: String,
  phone: String,
  company: String,
  macros: {
    C: { type: Number, default: 0 },
    P: { type: Number, default: 0 },
    F: { type: Number, default: 0 }
  },
  
  // Meal preferences from Athleat
  mealPerDay: {
    type: Number,
    default: 1,
    min: 0,
    max: 5
  },
  breakfastInclude: {
    type: Boolean,
    default: false
  },
  mealSnack: {
    type: Boolean,
    default: false
  },
  mealPlan: {
    type: String,
    enum: ['Standard', 'Customized', 'Premium', 'Vegan', 'Keto', 'Paleo', 'Bodybuilder', 'Lean 2 Meal', 'Lean 3 Meal', 'Thrive 2 Meal', 'Thrive 3 Meal', 'Perform 2 Meal', 'Perform 3 Meal'],
    default: 'Standard'
  },
  mealExclusion: {
    type: String,
    default: ''
  },
  
  // Data source
  dataSource: {
    type: String,
    default: 'WebData'
  },
  
  // Athleat sync
  athleatId: String,
  athleatModId: String, // For optimistic locking
  athleatSyncedAt: Date,
  uuid: String, // uuid_Customer - THE KEY FOR RELATIONSHIPS with Orders
  
  // Weekly menu selection
  selectedMeals: [{
    date: Date,
    mealType: {
      type: String,
      enum: ['breakfast', 'lunch', 'dinner', 'snack']
    },
    menuItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MenuItem'
    },
    mealName: String,
    description: String,
    slotNumber: Number,
    proteinChoice: String,
    vegChoice: String,
    carbChoice: String,
    sauceChoice: String,
    quantity: {
      type: Number,
      default: 1,
      min: 1
    },
    carbVegAction: {
      type: String,
      enum: ['kept', 'replace']
    },
    carbVegConflict: [String]
  }],
  
  // Current week info
  currentWeekMenu: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WeeklyMenu'
  },
  lastMenuSelectionDate: Date,
  
  // Preferences
  dietaryRestrictions: [String],
  allergies: [String],
  preferences: String,
  weekend: {
    type: Boolean,
    default: false
  },
  
  // Plan cycle / subscription
  planStartDate: {
    type: Date,
    default: null
  },
  cycleDuration: {
    type: Number,
    default: 0
  },
  amountPaid: {
    type: String,
    default: ''
  },
  discount: {
    type: String,
    default: ''
  },

  // System fields
  isActive: {
    type: Boolean,
    default: true
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

// Indexes for searches
customerSchema.index({ customerId: 1 }, { unique: true });
customerSchema.index({ email: 1 }, { unique: true, sparse: true }); // Sparse allows multiple null values
customerSchema.index({ athleatId: 1 }, { sparse: true });

export default mongoose.model('Customer', customerSchema);
