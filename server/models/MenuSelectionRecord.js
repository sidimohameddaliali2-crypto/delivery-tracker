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
  email: {
    type: String,
    required: true,
    index: true
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
    vegConflict: [String]
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

// Unique: one record per customer email per weekly menu
menuSelectionRecordSchema.index({ weeklyMenuId: 1, email: 1 }, { unique: true });

export default mongoose.model('MenuSelectionRecord', menuSelectionRecordSchema);
