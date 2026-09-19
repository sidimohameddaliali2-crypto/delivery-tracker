import mongoose from 'mongoose';

/**
 * MenuSelectionRecord
 *
 * Stores a customer's meal selections for a specific weekly menu.
 * Unlike Customer.selectedMeals (which is overwritten each time a customer
 * submits for any menu), this collection keeps one record per customer+menu
 * so that admin can always view full historical selections for any menu link.
 */
const menuSelectionRecordSchema = new mongoose.Schema({
  weeklyMenuId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WeeklyMenu',
    required: true,
    index: true
  },
  // Primary join to Customer going forward. Records created/updated before
  // this field existed (or where matching couldn't resolve a Customer) may
  // have this unset — see the {weeklyMenuId, email} fallback index below and
  // server/scripts/migrate-customer-ref.js for backfilling existing records.
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    index: true
  },
  email: {
    type: String,
    required: true,
    index: true,
    lowercase: true,
    trim: true
  },
  customerId: {
    type: String,
    index: true
  },
  firstName: String,
  lastName: String,
  mealExclusion: String,

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
    manualProteinType: {
      type: String,
      enum: ['', 'chicken', 'beef', 'fish'],
      default: ''
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1
    },
    carbVegAction: {
      type: String,
      enum: ['kept', 'replace']
    },
    carbVegConflict: [String],
    carbConflict: [String],
    vegConflict: [String],
    // Set only for mealType: 'snack' — the randomly-assigned ingredient's
    // macros, already divided by that day's snack count.
    snackMacros: {
      C: Number,
      P: Number,
      F: Number
    },
    // True for meals filled in by kitchen staff via "Auto-Assign Main Meals" /
    // "Auto-Assign Snacks" (server/routes/menus.js) rather than picked by the
    // customer. Kept out of the customer-facing menu-selection preview
    // (GET /menus/customers/:customerId/meal-profile) — visible only in the
    // Kitchen List — so customers are never shown a choice they didn't make.
    isAutoAssigned: {
      type: Boolean,
      default: false
    }
  }],

  // Days the customer chose to skip in the menu-selection link. Each entry
  // tracks the outcome of the automatic Matter subscription pause created for
  // that day (paused day + resume day placed after the cycle end). Surfaced
  // in the admin selections view only — never sent to the customer.
  skippedDays: [{
    date: { type: String },              // "YYYY-MM-DD"
    pauseStatus: {
      type: String,
      enum: ['pending', 'success', 'already_paused', 'failed'],
      default: 'pending'
    },
    resumeDate: { type: String },        // "YYYY-MM-DD" assigned after cycle end (on success)
    subscriptionId: { type: String },
    error: { type: String },             // failure detail shown next to the date in admin
    processedAt: { type: Date }
  }],

  submittedAt: {
    type: Date,
    default: Date.now
  }
  ,
  macros: {
    total: {
      C: Number,
      P: Number,
      F: Number,
      calories: Number
    },
    presets: {
      breakfast: {
        C: Number,
        P: Number,
        F: Number
      },
      snack: {
        C: Number,
        P: Number,
        F: Number
      }
    },
    perMeal: [{ C: Number, P: Number, F: Number, V: Number }]
  }
}, {
  timestamps: true
});

// Unique: one record per customer per weekly menu. Two partial indexes so
// existing records (which predate the `customer` field) stay protected by
// the old email-based constraint until backfilled, while every new/migrated
// record moves onto the customer-based constraint.
menuSelectionRecordSchema.index(
  { weeklyMenuId: 1, customer: 1 },
  { unique: true, partialFilterExpression: { customer: { $type: 'objectId' } } }
);
menuSelectionRecordSchema.index(
  { weeklyMenuId: 1, email: 1 },
  { unique: true, partialFilterExpression: { customer: { $exists: false } } }
);

export default mongoose.model('MenuSelectionRecord', menuSelectionRecordSchema);
