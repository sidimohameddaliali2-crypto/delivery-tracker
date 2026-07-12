import athleatService from './services/athleatService.js';

async function test() {
  try {
    console.log('=== Testing Order Schedule Meal with uuid_Customer ===\n');
    
    // Step 1: Get customer by email
    console.log('Step 1: Fetching customer by email: abigail.e.swetz@gmail.com');
    const customerData = await athleatService.getCustomerByEmail('abigail.e.swetz@gmail.com');
    
    if (!customerData) {
      console.log('❌ Customer not found');
      process.exit(1);
    }
    
    if (!customerData.uuid) {
      console.log('❌ No uuid_Customer found in customer record');
      console.log('Available fields:', Object.keys(customerData));
      process.exit(1);
    }
    
    console.log('✅ Customer found');
    console.log('   uuid_Customer:', customerData.uuid);
    console.log('   Name:', customerData.firstName, customerData.lastName);
    console.log('   Email:', customerData.email);
    
    // Step 2: Query scheduled meals using uuid_Customer
    console.log('\nStep 2: Querying scheduled meals with uuid_Customer');
    
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 30);
    
    const startDateStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
    const endDateStr = `${endDate.getMonth() + 1}/${endDate.getDate()}/${endDate.getFullYear()}`;
    
    console.log(`   Date range: ${startDateStr} to ${endDateStr}`);
    
    const scheduledMeals = await athleatService.getOrderScheduleMealData(
      customerData.uuid,
      startDateStr,
      endDateStr
    );
    
    if (!scheduledMeals || scheduledMeals.length === 0) {
      console.log('⚠️  No scheduled meals found for this date range');
      console.log('   This could mean:');
      console.log('   - Customer has no scheduled meals in FileMaker');
      console.log('   - Date range is outside of scheduled period');
      console.log('   - uuid_Customer has no related Order records');
    } else {
      console.log(`✅ Found ${scheduledMeals.length} scheduled meals`);
      console.log('\n=== Sample Meals ===');
      scheduledMeals.slice(0, 5).forEach((meal, idx) => {
        console.log(`\nMeal ${idx + 1}:`);
        console.log('  Date:', meal.date);
        console.log('  Type:', meal.mealType);
        console.log('  Meal:', meal.meal);
        if (meal.key_BOOLEAN) console.log('  Modified:', meal.key_BOOLEAN);
      });
      
      if (scheduledMeals.length > 5) {
        console.log(`\n... and ${scheduledMeals.length - 5} more meals`);
      }
    }
    
    console.log('\n=== Test Complete ===');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response?.data) {
      console.error('FileMaker error:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

test();
