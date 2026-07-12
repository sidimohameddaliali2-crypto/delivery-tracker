import axios from 'axios';

const baseURL = 'http://fmserver19.hulexo.online:3000';
const database = 'Athleat%20Dev';
const basicAuth = 'V2ViQVBJOldlYkFQSUF0aGxlYXQ=';
const searchEmail = 'abigail.e.swetz@gmail.com';

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

async function searchEmailInLeads() {
  const token = await getToken();
  if (!token) {
    console.error('Could not get token');
    return;
  }

  try {
    console.log(`Searching for email: ${searchEmail}\n`);

    // Get all leads and search locally
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
    const matching = records.filter(r => r.fieldData?.contactEmail?.toLowerCase() === searchEmail.toLowerCase());

    console.log(`Total Leads records: ${records.length}`);
    console.log(`Matching email: ${matching.length}`);

    if (matching.length > 0) {
      console.log('\n=== MATCHING RECORD ===');
      console.log(JSON.stringify(matching[0].fieldData, null, 2));
    } else {
      console.log('\nNo Leads record found with that email.');
      console.log('\n=== Sample emails from Leads ===');
      const nonEmptyEmails = records
        .filter(r => r.fieldData?.contactEmail)
        .slice(0, 10);
      nonEmptyEmails.forEach((r, i) => {
        console.log(`${i + 1}. ${r.fieldData.contactEmail}`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

searchEmailInLeads();
