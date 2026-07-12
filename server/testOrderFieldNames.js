import axios from 'axios';

const baseURL = 'http://fmserver19.hulexo.online:3000';
const database = 'Athleat%20Dev';
const basicAuth = 'V2ViQVBJOldlYkFQSUF0aGxlYXQ=';
const TEST_EMAIL = 'braydenainzuain@gmail.com';

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

async function testFieldNames() {
  const token = await getToken();
  if (!token) {
    console.error('Could not get token');
    return;
  }

  const fieldNamesToTry = [
    'customerEmail',
    'email',
    'Email',
    'customer_email',
    'customerFullName',
    'uuid_Customer',
  ];

  console.log(`\nTesting different field names for: ${TEST_EMAIL}\n`);

  for (const fieldName of fieldNamesToTry) {
    try {
      const response = await axios.post(
        `${baseURL}/fmi/data/vLatest/databases/${database}/layouts/Order%3A%20Web%20Data/_find`,
        {
          query: [{ [fieldName]: TEST_EMAIL }],
          limit: 10
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      const recordsFound = response.data?.response?.data?.length || 0;
      if (recordsFound > 0) {
        console.log(`✅ FOUND with field: ${fieldName}`);
        console.log(`   Records: ${recordsFound}`);
        console.log(`   First record email: ${response.data.response.data[0].fieldData.customerEmail}`);
      } else {
        console.log(`❌ No results with field: ${fieldName}`);
      }
    } catch (error) {
      console.log(`❌ ERROR with ${fieldName}: ${error.message}`);
    }
  }
}

testFieldNames();
