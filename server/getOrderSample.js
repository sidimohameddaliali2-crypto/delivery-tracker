import axios from 'axios';

const baseURL = 'http://fmserver19.hulexo.online:3000';
const database = 'Athleat%20Dev';
const basicAuth = 'V2ViQVBJOldlYkFQSUF0aGxlYXQ=';
const TEST_UUID = 'B0330920-27D1-EC42-9F1C-60C80A1E40FF';
const TEST_EMAIL = 'abigail.e.swetz@gmail.com';

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

async function getOrderDataSample() {
  const token = await getToken();
  if (!token) {
    console.error('Could not get token');
    return;
  }

  try {
    console.log(`Fetching sample Order records with uuid_Customer and customerEmail...\n`);

    const response = await axios.get(
      `${baseURL}/fmi/data/vLatest/databases/${database}/layouts/Order%3A%20Web%20Data/records?_limit=20`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    const records = response.data?.response?.data || [];
    
    console.log('=== UUID_CUSTOMER AND CUSTOMEREMAIL SAMPLE ===\n');
    records.forEach((r, i) => {
      const uuid = r.fieldData?.uuid_Customer || '(empty)';
      const email = r.fieldData?.customerEmail || '(empty)';
      const name = r.fieldData?.customerFullName || '(empty)';
      console.log(`${i + 1}. UUID: ${uuid}`);
      console.log(`   Email: ${email}`);
      console.log(`   Name: ${name}\n`);
    });

    console.log('=== COMPARING WITH TEST CUSTOMER ===');
    console.log(`Looking for UUID: ${TEST_UUID}`);
    console.log(`Looking for Email: ${TEST_EMAIL}`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

getOrderDataSample();
