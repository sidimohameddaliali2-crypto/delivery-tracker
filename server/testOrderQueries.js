import athleatService from './services/athleatService.js';

// Use a UUID that we know exists in Order records
const TEST_UUID_WITH_ORDERS = '17C69728-F86D-C74E-BBC5-7EA2EDF4F2D2'; // Brayden Ainzuain
const TEST_EMAIL_WITH_ORDERS = 'braydenainzuain@gmail.com';

async function testOrderQueries() {
  try {
    console.log('=== TESTING ORDER QUERIES ===\n');
    
    // Test 1: Query by uuid_Customer
    console.log('Test 1: Get Order by uuid_Customer');
    console.log(`UUID: ${TEST_UUID_WITH_ORDERS}\n`);
    
    try {
      const orderByUUID = await athleatService.getOrderByUUID(TEST_UUID_WITH_ORDERS);
      console.log(`Result: ${orderByUUID ? 'FOUND' : 'NOT FOUND'}`);
      if (orderByUUID) {
        console.log(`Customer: ${orderByUUID.customerFullName}`);
        console.log(`Email: ${orderByUUID.customerEmail}`);
        console.log(`Meal Plan: ${orderByUUID.mealPlan}`);
        console.log(`Meal Per Day: ${orderByUUID.mealPerDay}`);
      }
    } catch (error) {
      console.log(`Error: ${error.message}`);
    }

    // Test 2: Query by email
    console.log('\n\nTest 2: Get Order by email');
    console.log(`Email: ${TEST_EMAIL_WITH_ORDERS}\n`);
    
    try {
      const orderByEmail = await athleatService.getOrderByEmail(TEST_EMAIL_WITH_ORDERS);
      console.log(`Result: ${orderByEmail ? 'FOUND' : 'NOT FOUND'}`);
      if (orderByEmail) {
        console.log(`Customer: ${orderByEmail.customerFullName}`);
        console.log(`Email: ${orderByEmail.customerEmail}`);
        console.log(`Meal Plan: ${orderByEmail.mealPlan}`);
        console.log(`Meal Per Day: ${orderByEmail.mealPerDay}`);
      }
    } catch (error) {
      console.log(`Error: ${error.message}`);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testOrderQueries();
