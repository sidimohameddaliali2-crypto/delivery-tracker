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

async function testCustomerLayout() {
  const token = await getToken();
  if (!token) {
    console.error('Could not get token');
    return;
  }

  try {
    console.log('Fetching sample Customer: Web Data records...\n');

    const response = await axios.get(
      `${baseURL}/fmi/data/vLatest/databases/${database}/layouts/Customer%3A%20Web%20Data/records?_limit=3`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    const records = response.data?.response?.data || [];
    console.log(`Sample records found: ${records.length}\n`);
    
    if (records.length > 0) {
      console.log('=== FIELD NAMES IN CUSTOMER: WEB DATA LAYOUT ===');
      const fieldNames = Object.keys(records[0].fieldData || {});
      console.log(fieldNames.sort().join('\n'));
      
      console.log('\n=== FIRST RECORD DATA ===');
      console.log(JSON.stringify(records[0].fieldData, null, 2));
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (error.response?.data?.messages) {
      console.error('FileMaker error:', error.response.data.messages);
    }
  }
}

testCustomerLayout();
