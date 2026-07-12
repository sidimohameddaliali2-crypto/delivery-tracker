import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Customer from './models/Customer.js';

dotenv.config();

const consolidateAllCustomers = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all customers with selected meals
    const customers = await Customer.find({
      'selectedMeals.0': { $exists: true }
    });

    console.log(`\nFound ${customers.length} customers with meal selections`);

    let updatedCount = 0;

    for (const customer of customers) {
      const originalCount = customer.selectedMeals.length;
      
      // Consolidate duplicates
      const consolidatedMap = new Map();
      
      customer.selectedMeals.forEach(meal => {
        const dateKey = meal.date ? meal.date.toISOString().split('T')[0] : '';
        const itemId = String(meal.menuItemId || '');
        const key = `${dateKey}||${itemId}`;
        
        if (consolidatedMap.has(key)) {
          const existing = consolidatedMap.get(key);
          existing.quantity = (existing.quantity || 1) + (meal.quantity || 1);
        } else {
          consolidatedMap.set(key, {
            date: meal.date,
            mealType: meal.mealType,
            menuItemId: meal.menuItemId,
            mealName: meal.mealName,
            description: meal.description,
            quantity: meal.quantity || 1
          });
        }
      });
      
      const consolidatedMeals = Array.from(consolidatedMap.values());
      
      // Only update if consolidation changed something
      if (consolidatedMeals.length !== originalCount) {
        customer.selectedMeals = consolidatedMeals;
        await customer.save();
        
        const totalBefore = originalCount;
        const totalAfter = consolidatedMeals.reduce((sum, m) => sum + (m.quantity || 1), 0);
        
        console.log(`✓ ${customer.email || customer.customerId}: ${originalCount} entries → ${consolidatedMeals.length} entries (${totalBefore} → ${totalAfter} total meals)`);
        updatedCount++;
      }
    }

    console.log(`\n✅ Consolidation complete! Updated ${updatedCount} customers.`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
};

consolidateAllCustomers();
