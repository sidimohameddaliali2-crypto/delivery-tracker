import axios from 'axios';

const baseURL = 'http://fmserver19.hulexo.online:3000';
const database = 'Athleat%20Dev';
const basicAuth = 'V2ViQVBJOldlYkFQSUF0aGxlYXQ=';
const testUUID = 'B0330920-27D1-EC42-9F1C-60C80A1E40FF';

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

async function testLayoutNames() {
  const token = await getToken();
  if (!token) {
    console.error('Could not get token');
    return;
  }

  const layoutNames = [
    'Lead%3A%20Web%20Data',           // Lead: Web Data (current)
    'Leads',                           // Just Leads
    'Lead',                            // Just Lead
    'Leads%3A%20Web%20Data',          // Leads: Web Data (old plural)
    'Lead%20Web%20Data',              // Lead Web Data (no colon)
    'Leads%20Web%20Data',             // Leads Web Data (no colon)
    'LeadLayout',                      // LeadLayout
    'Lead%20Layout',                  // Lead Layout
  ];

  console.log('Testing different Lead layout name variations...\n');

  for (const layoutName of layoutNames) {
    try {
      const response = await axios.post(
        `${baseURL}/fmi/data/vLatest/databases/${database}/layouts/${layoutName}/_find`,
        {
          query: [{ uuid_Customer: testUUID }],
          limit: 5
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'timeout': 5000
          }
        }
      );

      console.log(`✅ SUCCESS with layout: ${layoutName}`);
      console.log(`   Records found: ${response.data?.response?.data?.length || 0}`);
      if (response.data?.response?.data?.length > 0) {
        console.log(`   Fields: ${Object.keys(response.data.response.data[0].fieldData || {}).join(', ')}`);
      }
      console.log();
      
    } catch (error) {
      if (error.response?.data?.messages?.[0]?.message === 'Layout is missing') {
        console.log(`❌ NOT FOUND: ${layoutName} (Layout is missing)`);
      } else {
        console.log(`❌ ERROR: ${layoutName} - ${error.message}`);
      }
    }
  }
}

testLayoutNames();
