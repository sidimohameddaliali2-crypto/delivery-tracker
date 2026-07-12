import mongoose from 'mongoose';

const menuItemSchema = new mongoose.Schema({
  // From Athleat
  athleatId: String,
  itemDate: Date,
  mealType: {
    type: String,
    enum: ['breakfast', 'lunch', 'dinner', 'snack'],
    required: true
  },
  mealName: {
    type: String,
    required: true
  },
  mealPlan: {
    type: String,
    enum: ['Standard', 'Customized', 'Premium', 'Vegan', 'Keto', 'Paleo', 'Bodybuilder'],
    default: 'Standard'
  },
  
  // Description and details
  description: String,
  ingredients: String,
  proteinSource: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    enum: ['WARM', 'COLD', ''],
    default: ''
  },
  intolerances: {
    type: String,
    default: ''
  },
  garnish: {
    type: String,
    default: ''
  },
  veg: String,
  sauce: String,
  instructions: String,
  image: String, // URL to image
  
  // Nutritional info
  calories: {
    type: Number,
    default: 0
  },
  protein: {
    type: Number,
    default: 0
  },
  carbs: {
    type: String,
    default: ''
  },
  fat: {
    type: Number,
    default: 0
  },
  fiber: {
    type: Number,
    default: 0
  },
  
  // Allergen information
  allergens: [String], // e.g., ['gluten', 'dairy', 'nuts']
  isVegan: {
    type: Boolean,
    default: false
  },
  isGlutenFree: {
    type: Boolean,
    default: false
  },
  
  // Availability
  isAvailable: {
    type: Boolean,
    default: true
  },
  price: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Tracking
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

menuItemSchema.index({ itemDate: 1, mealType: 1 });
menuItemSchema.index({ mealPlan: 1 });

export default mongoose.model('MenuItem', menuItemSchema);
