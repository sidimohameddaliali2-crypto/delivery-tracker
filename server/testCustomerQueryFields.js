import AthleatService from './services/athleatService.js';

async function testCustomerQueries() {
  const service = new AthleatService();

  console.log('=== TESTING CUSTOMER QUERY FIELDS ===\n');

  try {
    // First get a sample record to know what to query
    const response = await axios.get(
      `https://${service.baseURL.replace('http://', '').replace('https://', '')}/fmi/data/vLatest/databases/Athleat%20Dev/layouts/Customer%3A%20Web%20Data/records?_limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${await service.getSessionToken()}`
        }
      }
    );

    if (!response.data.response.data || response.data.response.data.length === 0) {
      console.log('No records found');
      return;
    }

    const sampleRecord = response.data.response.data[0].fieldData;
    console.log('Sample Record Data:');
    console.log(`- id: ${sampleRecord.id}`);
    console.log(`- uuid: ${sampleRecord.uuid}`);
    console.log(`- contactEmail: ${sampleRecord.contactEmail}`);
    console.log(`- nameFull: ${sampleRecord.nameFull}`);
    console.log(`- nameFirst: ${sampleRecord.nameFirst}\n`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testCustomerQueries();
