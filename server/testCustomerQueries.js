import axios from 'axios';
import https from 'https';

const FILEMAKER_CONFIG = {
  baseURL: 'https://fmserver19.hulexo.online:3000/fmi/data/vLatest/databases/Athleat/layouts/Customer%3A%20Web%20Data',
  auth: {
    username: 'API_User',
    password: 'Hulexo@12345'
  }
};

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function testCustomerQueries() {
  console.log('=== TESTING CUSTOMER QUERY FIELDS ===\n');

  // First get a sample record to know what to query
  try {
    const sampleResp = await axios.get(
      `${FILEMAKER_CONFIG.baseURL}/records?_limit=1`,
      { auth: FILEMAKER_CONFIG.auth, httpsAgent }
    );

    if (sampleResp.data.response.data.length === 0) {
      console.log('No records found');
      return;
    }

    const sampleRecord = sampleResp.data.response.data[0].fieldData;
    console.log('Sample Record Data:');
    console.log(`- id: ${sampleRecord.id}`);
    console.log(`- uuid: ${sampleRecord.uuid}`);
    console.log(`- contactEmail: ${sampleRecord.contactEmail}`);
    console.log(`- nameFull: ${sampleRecord.nameFull}`);
    console.log(`- nameFirst: ${sampleRecord.nameFirst}\n`);

    // Test different fields
    const fieldsToTest = [
      { name: 'uuid', value: sampleRecord.uuid },
      { name: 'id', value: sampleRecord.id },
      { name: 'contactEmail', value: sampleRecord.contactEmail },
      { name: 'nameFull', value: sampleRecord.nameFull },
      { name: 'nameFirst', value: sampleRecord.nameFirst }
    ];

    for (const field of fieldsToTest) {
      try {
        const response = await axios.post(
          `${FILEMAKER_CONFIG.baseURL}/records?_find`,
          {
            query: [{ [field.name]: field.value }]
          },
          { auth: FILEMAKER_CONFIG.auth, httpsAgent }
        );

        console.log(`✅ Query ${field.name} = "${field.value}"`);
        console.log(`   Results: ${response.data.response.data.length} records\n`);
      } catch (error) {
        console.log(`❌ Query ${field.name} = "${field.value}"`);
        console.log(`   Error: ${error.response?.data?.messages?.[0]?.message || error.message}\n`);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testCustomerQueries();
