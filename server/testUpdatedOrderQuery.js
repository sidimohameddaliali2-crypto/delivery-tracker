import AthleatService from './services/athleatService.js';

console.log('\n=== TESTING UPDATED getOrderRawByEmail METHOD ===\n');

// Test with known customer email from Customer layout
const testEmail = 'braydenainzuain@gmail.com';
console.log(`Querying Order records for email: ${testEmail}\n`);

const orders = await AthleatService.getOrderRawByEmail(testEmail);
console.log(`\nFound ${orders.length} order records for ${testEmail}`);

if (orders.length > 0) {
  console.log('\nFirst Order Record:');
  const firstOrder = orders[0].fieldData;
  console.log(JSON.stringify(firstOrder, null, 2));
}
