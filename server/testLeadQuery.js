import athleatService from './services/athleatService.js';

// Test customer uuid from previous tests
const TEST_UUID = 'B0330920-27D1-EC42-9F1C-60C80A1E40FF';

async function testLeadQuery() {
  try {
    console.log('Testing Lead: Web Data query with uuid_Customer and date...\n');
    
    // Test with uuid_Customer only first
    const result = await athleatService.getLeadByUUIDAndDate(
      TEST_UUID,
      '2/10/2026',
      '3/12/2026'
    );

    console.log('\n=== QUERY RESULT ===');
    console.log(`Total records found: ${result.length}`);
    
    if (result.length > 0) {
      console.log('\nFirst record:');
      console.log(JSON.stringify(result[0], null, 2));
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testLeadQuery();
