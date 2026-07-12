import axios from 'axios';

const baseURL = 'http://fmserver19.hulexo.online:3000';
const database = 'Athleat%20Dev';
const basicAuth = 'V2ViQVBJOldlYkFQSUF0aGxlYXQ=';

async function getToken() {
  try {
    const response = await axios.post(
      `${baseURL}/fmi/data/vLatest/databases/${database}/sessions`,
      {},
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${basicAuth}`
        }
      }
    );
    return response.data?.response?.token;
  } catch (error) {
    console.error('Token error:', error.message);
    return null;
  }
}

async function testDifferentQueries() {
  const token = await getToken();
  if (!token) {
    console.error('Could not get token');
    return;
  }

  console.log('Testing different query fields for Order: Web Data\n');

  // Get first record to know what to search for
  const getResp = await axios.get(
    `${baseURL}/fmi/data/vLatest/databases/${database}/layouts/Order%3A%20Web%20Data/records?_limit=1`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );
  const firstRecord = getResp.data?.response?.data?.[0]?.fieldData;
  
  console.log('Sample data from first record:');
  console.log(`  customerFullName: ${firstRecord?.customerFullName}`);
  console.log(`  uuid_Customer: ${firstRecord?.uuid_Customer}`);
  console.log(`  id: ${firstRecord?.id}`);
  console.log(`  customerEmail: ${firstRecord?.customerEmail}\n`);

  const queriesToTest = [
    { field: 'uuid_Customer', value: firstRecord?.uuid_Customer },
    { field: 'id', value: firstRecord?.id },
    { field: 'customerFirstName', value: firstRecord?.customerFirstName },
    { field: 'customerFullName', value: firstRecord?.customerFullName },
    { field: 'customerEmail', value: firstRecord?.customerEmail },
  ];

  for (const test of queriesToTest) {
    try {
      const response = await axios.post(
        `${baseURL}/fmi/data/vLatest/databases/${database}/layouts/Order%3A%20Web%20Data/_find`,
        {
          query: [{ [test.field]: test.value }],
          limit: 5
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );
      const found = response.data?.response?.data?.length || 0;
      console.log(`✅ Query ${test.field} = "${test.value}"`);
      console.log(`   Results: ${found} records\n`);
    } catch (error) {
      console.log(`❌ Query ${test.field}: ${error.message}\n`);
    }
  }
}

testDifferentQueries();
