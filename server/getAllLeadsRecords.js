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

async function getAllLeadsRecords() {
  const token = await getToken();
  if (!token) {
    console.error('Could not get token');
    return;
  }

  try {
    console.log('Fetching ALL records from Leads: Web Data layout...\n');

    const response = await axios.get(
      `${baseURL}/fmi/data/vLatest/databases/${database}/layouts/Leads%3A%20Web%20Data/records?_limit=100`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    const records = response.data?.response?.data || [];
    console.log(`Total records found: ${records.length}\n`);
    
    if (records.length > 0) {
      console.log('=== FIELD NAMES IN LEADS LAYOUT ===');
      const fieldNames = Object.keys(records[0].fieldData || {});
      console.log(fieldNames.sort().join('\n'));
      
      console.log('\n=== FIRST 3 RECORDS ===');
      for (let i = 0; i < Math.min(3, records.length); i++) {
        console.log(`\n--- Record ${i + 1} ---`);
        console.log(JSON.stringify(records[i].fieldData, null, 2));
      }
    } else {
      console.log('No records in Leads: Web Data layout');
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (error.response?.data?.messages) {
      console.error('FileMaker error:', error.response.data.messages);
    }
  }
}

getAllLeadsRecords();
