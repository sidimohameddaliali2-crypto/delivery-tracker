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

async function searchOrdersByCustomer() {
  const token = await getToken();
  if (!token) {
    console.error('Could not get token');
    return;
  }

  try {
    console.log(`=== SEARCHING ORDER: WEB DATA ===`);
    console.log(`Test UUID: ${TEST_UUID}`);
    console.log(`Test Email: ${TEST_EMAIL}\n`);

    // Get all orders and search locally
    const response = await axios.get(
      `${baseURL}/fmi/data/vLatest/databases/${database}/layouts/Order%3A%20Web%20Data/records?_limit=200`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    const records = response.data?.response?.data || [];
    
    // Search by UUID
    const byUUID = records.filter(r => r.fieldData?.uuid_Customer === TEST_UUID);
    console.log(`\nMatching by uuid_Customer: ${byUUID.length} records`);
    
    if (byUUID.length > 0) {
      console.log('\n=== FIRST MATCHING RECORD (BY UUID) ===');
      console.log(JSON.stringify(byUUID[0].fieldData, null, 2));
    }

    // Search by Email
    const byEmail = records.filter(r => 
      r.fieldData?.customerEmail?.toLowerCase() === TEST_EMAIL.toLowerCase()
    );
    console.log(`\nMatching by customerEmail: ${byEmail.length} records`);
    
    if (byEmail.length > 0) {
      console.log('\n=== FIRST MATCHING RECORD (BY EMAIL) ===');
      console.log(JSON.stringify(byEmail[0].fieldData, null, 2));
    }

    // Statistics
    console.log(`\n=== STATISTICS ===`);
    console.log(`Total Order records: ${records.length}`);
    console.log(`Records with uuid_Customer filled: ${records.filter(r => r.fieldData?.uuid_Customer).length}`);
    console.log(`Records with customerEmail filled: ${records.filter(r => r.fieldData?.customerEmail).length}`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

searchOrdersByCustomer();
