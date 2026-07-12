import athleatService from './services/athleatService.js';

// Use a UUID that we know exists in Order records  
const TEST_UUID_WITH_ORDERS = '17C69728-F86D-C74E-BBC5-7EA2EDF4F2D2'; // Brayden Ainzuain
const TEST_EMAIL_WITH_ORDERS = 'braydenainzuain@gmail.com';

async function testOrderRawQueries() {
  try {
    console.log('=== TESTING ORDER RAW QUERIES ===\n');
    
    // Test 1: Query by email using getOrderRawByEmail
    console.log('Test 1: Get Order (raw) by email');
    console.log(`Email: ${TEST_EMAIL_WITH_ORDERS}\n`);
    
    const orderByEmail = await athleatService.getOrderRawByEmail(TEST_EMAIL_WITH_ORDERS);
    console.log(`Records found: ${orderByEmail.length}`);
    
    if (orderByEmail.length > 0) {
      console.log('\n=== FIRST RECORD ===');
      console.log(JSON.stringify(orderByEmail[0].fieldData, null, 2));
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testOrderRawQueries();
