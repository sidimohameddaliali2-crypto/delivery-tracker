import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Customer from './models/Customer.js';

dotenv.config();

const findDuplicates = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all customers with multiple meal selections
    const customers = await Customer.find({
      selectedMeals: { $exists: true, $not: { $size: 0 } }
    });

    console.log(`\nChecking ${customers.length} customers for duplicates...\n`);

    let duplicatesFound = 0;

    for (const customer of customers) {
      if (customer.selectedMeals.length < 2) continue;

      // Group by date + meal name to find duplicates
      const mealMap = new Map();
      
      customer.selectedMeals.forEach((meal, idx) => {
        const dateKey = meal.date ? meal.date.toISOString().split('T')[0] : 'no-date';
        const mealName = meal.mealName || 'no-name';
        const itemId = meal.menuItemId ? String(meal.menuItemId) : 'no-id';
        
        const key1 = `${dateKey}||${mealName}`;
        const key2 = `${dateKey}||${itemId}`;
        
        if (!mealMap.has(key1)) {
          mealMap.set(key1, []);
        }
        mealMap.get(key1).push({ idx, meal });
      });

      // Check for duplicates
      let hasDuplicates = false;
      for (const [key, meals] of mealMap.entries()) {
        if (meals.length > 1) {
          if (!hasDuplicates) {
            console.log(`\n${customer.email || customer.customerId}:`);
            console.log(`  Total meals: ${customer.selectedMeals.length}`);
            hasDuplicates = true;
            duplicatesFound++;
          }
          
          console.log(`  - "${meals[0].meal.mealName}" appears ${meals.length} times on ${key.split('||')[0]}`);
          meals.forEach(m => {
            console.log(`    [${m.idx}] quantity: ${m.meal.quantity || 1}, menuItemId: ${m.meal.menuItemId}`);
          });
        }
      }
    }

    console.log(`\n\n✅ Found ${duplicatesFound} customers with duplicate entries`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
};

findDuplicates();
