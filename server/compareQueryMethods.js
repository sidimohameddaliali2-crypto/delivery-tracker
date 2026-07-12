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

async function compareQueryMethods() {
  const token = await getToken();
  if (!token) {
    console.error('Could not get token');
    return;
  }

  console.log('Comparing GET vs POST _find for Order: Web Data\n');

  // Method 1: GET all records
  try {
    console.log('Method 1: GET /records?_limit=5');
    const getResponse = await axios.get(
      `${baseURL}/fmi/data/vLatest/databases/${database}/layouts/Order%3A%20Web%20Data/records?_limit=5`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    console.log(`✅ Success - Records: ${getResponse.data?.response?.data?.length || 0}`);
    if (getResponse.data?.response?.data?.length > 0) {
      console.log(`   First record email: ${getResponse.data.response.data[0].fieldData.customerEmail}`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }

  // Method 2: POST _find with empty query (all records)
  try {
    console.log('\nMethod 2: POST _find with empty query');
    const findResponse = await axios.post(
      `${baseURL}/fmi/data/vLatest/databases/${database}/layouts/Order%3A%20Web%20Data/_find`,
      {
        query: [],
        limit: 5
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );
    console.log(`✅ Success - Records: ${findResponse.data?.response?.data?.length || 0}`);
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    if (error.response?.data?.messages) {
      console.log(`   FileMaker error: ${error.response.data.messages[0]?.message}`);
    }
  }

  // Method 3: POST _find with specific email
  try {
    console.log('\nMethod 3: POST _find with customerEmail query');
    const findResponse = await axios.post(
      `${baseURL}/fmi/data/vLatest/databases/${database}/layouts/Order%3A%20Web%20Data/_find`,
      {
        query: [{ customerEmail: 'braydenainzuain@gmail.com' }],
        limit: 5
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );
    console.log(`✅ Success - Records: ${findResponse.data?.response?.data?.length || 0}`);
    if (findResponse.data?.response?.data?.length > 0) {
      console.log(`   First record: ${findResponse.data.response.data[0].fieldData.customerFullName}`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

compareQueryMethods();
