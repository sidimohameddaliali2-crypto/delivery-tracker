import AthleatService from './services/athleatService.js';

console.log('=== COMPREHENSIVE TEST OF UPDATED QUERY METHODS ===\n');

// Test email
const testEmail = 'braydenainzuain@gmail.com';

console.log(`Testing with email: ${testEmail}\n`);

// Test 1: getOrderRawByEmail
console.log('--- Test 1: getOrderRawByEmail (email → uuid → order) ---');
const orderRawByEmail = await AthleatService.getOrderRawByEmail(testEmail);
console.log(`Result: ${orderRawByEmail.length} order records found\n`);

// Test 2: getOrderMealData
console.log('--- Test 2: getOrderMealData (email → uuid → order → parsed) ---');
const mealData = await AthleatService.getOrderMealData(testEmail);
console.log(`Result:`, mealData);
console.log();

// Test 3: Direct UUID query (new method)
console.log('--- Test 3: getOrderRawByUUID (direct uuid query) ---');
const uuid = 'CDACCF04-6F1A-B946-9CD4-F8AAA0F34003'; // From Customer layout
const orderRawByUUID = await AthleatService.getOrderRawByUUID(uuid);
console.log(`Result: ${orderRawByUUID.length} order records found for uuid ${uuid}\n`);

// Test 4: Customer field queryability test
console.log('--- Test 4: Customer field queryability ---');
await AthleatService.testCustomerFieldQueryability();

console.log('\n=== ALL TESTS COMPLETE ===');
