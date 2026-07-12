import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Customer from './models/Customer.js';

dotenv.config();

const testSave = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const customer = await Customer.findOne({ email: /sidi\.dali@gmail\.com/i });
    
    if (!customer) {
      console.log('Customer not found');
      return;
    }

    console.log('\n=== BEFORE UPDATE ===');
    console.log('Current meals:', customer.selectedMeals.length);
    if (customer.selectedMeals.length > 0) {
      console.log('First meal quantity:', customer.selectedMeals[0].quantity);
    }

    // Create a test selection with quantity: 3
    const testSelection = {
      date: new Date('2026-03-02'),
      mealType: 'lunch',
      menuItemId: new mongoose.Types.ObjectId('699d6b56d1cd8fadc0d1dc10'),
      mealName: 'TEST MEAL WITH QUANTITY',
      quantity: 3
    };

    console.log('\n=== SETTING NEW SELECTION ===');
    console.log('Test selection:', testSelection);

    customer.selectedMeals = [testSelection];
    await customer.save();

    console.log('\n=== AFTER SAVE (reading from variable) ===');
    console.log('Meals count:', customer.selectedMeals.length);
    console.log('First meal quantity:', customer.selectedMeals[0].quantity);

    // Fetch fresh from DB
    const refreshed = await Customer.findById(customer._id);
    console.log('\n=== AFTER SAVE (fresh from DB) ===');
    console.log('Meals count:', refreshed.selectedMeals.length);
    console.log('First meal quantity:', refreshed.selectedMeals[0].quantity);
    console.log('Full meal object:', JSON.stringify(refreshed.selectedMeals[0], null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
};

testSave();
