import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Customer from './models/Customer.js';

dotenv.config();

const checkCustomer = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const customer = await Customer.findOne({ email: /sidi\.dali@gmail\.com/i });
    
    if (!customer) {
      console.log('Customer not found');
      return;
    }

    console.log('\n=== Customer Info ===');
    console.log('Email:', customer.email);
    console.log('Name:', customer.firstName, customer.lastName);
    console.log('selectedMeals count:', customer.selectedMeals.length);
    
    console.log('\n=== Selected Meals ===');
    customer.selectedMeals.forEach((meal, idx) => {
      console.log(`\nMeal ${idx + 1}:`);
      console.log('  date:', meal.date);
      console.log('  mealName:', meal.mealName);
      console.log('  mealType:', meal.mealType);
      console.log('  menuItemId:', meal.menuItemId);
      console.log('  quantity:', meal.quantity);
    });

    // Calculate total with quantity
    const total = customer.selectedMeals.reduce((sum, meal) => sum + (meal.quantity || 1), 0);
    console.log('\n=== Summary ===');
    console.log('Total unique meal entries:', customer.selectedMeals.length);
    console.log('Total meals (with quantity):', total);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
};

checkCustomer();
