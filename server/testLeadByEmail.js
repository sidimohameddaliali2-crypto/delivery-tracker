import athleatService from './services/athleatService.js';

// Test customer email
const TEST_EMAIL = 'abigail.e.swetz@gmail.com';

async function testLeadQueryByEmail() {
  try {
    console.log('Testing Leads: Web Data query by email...\n');
    
    // Use the existing getLeadByEmail method
    const result = await athleatService.getLeadByEmail(TEST_EMAIL);

    console.log('\n=== QUERY RESULT ===');
    console.log(`Result:`, result);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testLeadQueryByEmail();
