import AthleatService from './services/athleatService.js';

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║     FILMAKER API QUERY OPTIMIZATION - FINAL VERIFICATION      ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const testEmails = [
  'braydenainzuain@gmail.com',  // Has orders
  'monaizy@gmail.com'            // May not have orders
];

for (const email of testEmails) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Testing Email: ${email}`);
  console.log('─'.repeat(60));

  try {
    // Test 1: Get raw order records
    console.log('\n1️⃣  Getting Order records via getOrderRawByEmail()...');
    const orders = await AthleatService.getOrderRawByEmail(email);
    console.log(`   ✅ Found ${orders.length} order record(s)`);

    if (orders.length > 0) {
      const order = orders[0].fieldData;
      console.log(`   📋 Order Details:`);
      console.log(`      - ID: ${order.id}`);
      console.log(`      - UUID: ${order.uuid_Customer}`);
      console.log(`      - Meal Plan: ${order.mealPlan}`);
      console.log(`      - Meals/Day: ${order.mealPerDay}`);
      console.log(`      - Date Start: ${order.dateStart}`);

      // Test 2: Get parsed meal data
      console.log('\n2️⃣  Getting parsed meal data via getOrderMealData()...');
      const mealData = await AthleatService.getOrderMealData(email);
      if (mealData) {
        console.log(`   ✅ Meal data parsed successfully`);
        console.log(`   📋 Parsed Data:`);
        console.log(`      - Meal Plan: ${mealData.mealPlan}`);
        console.log(`      - Meals/Day: ${mealData.mealPerDay}`);
        console.log(`      - Breakfast: ${mealData.breakfastInclude ? 'Yes' : 'No'}`);
        console.log(`      - Snack: ${mealData.mealSnack}`);
        console.log(`      - Exclusions: ${mealData.mealExclusion}`);
      } else {
        console.log(`   ⚠️  No meal data found`);
      }

      // Test 3: Direct UUID query
      console.log('\n3️⃣  Testing direct UUID query via getOrderRawByUUID()...');
      const ordersByUUID = await AthleatService.getOrderRawByUUID(order.uuid_Customer);
      console.log(`   ✅ Found ${ordersByUUID.length} order record(s) using uuid`);
    } else {
      console.log(`   ℹ️  No orders found for this customer (may not have meal plan)`);
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  }
}

console.log('\n' + '═'.repeat(60));
console.log('✅ VERIFICATION COMPLETE');
console.log('═'.repeat(60) + '\n');
