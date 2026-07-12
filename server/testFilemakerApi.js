import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const baseURL = process.env.ATHLEAT_BASE_URL;
const database = process.env.ATHLEAT_DATABASE;
const basicAuth = process.env.ATHLEAT_BASIC_AUTH;
const testLayout = process.env.FILEMAKER_TEST_LAYOUT || 'Customer%3A%20Web%20Data';

function validateEnv() {
  const missing = [];

  if (!baseURL) missing.push('ATHLEAT_BASE_URL');
  if (!database) missing.push('ATHLEAT_DATABASE');
  if (!basicAuth) missing.push('ATHLEAT_BASIC_AUTH');

  if (missing.length > 0) {
    console.error('Missing required env vars:', missing.join(', '));
    process.exit(1);
  }
}

async function getSessionToken() {
  const url = `${baseURL}/fmi/data/vLatest/databases/${database}/sessions`;

  const response = await axios.post(
    url,
    {},
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${basicAuth}`
      },
      timeout: 15000
    }
  );

  const token = response?.data?.response?.token;
  if (!token) {
    throw new Error('No session token returned by Filemaker API');
  }

  return token;
}

async function testLayoutRead(token) {
  const url = `${baseURL}/fmi/data/vLatest/databases/${database}/layouts/${testLayout}/records?_limit=1`;

  const response = await axios.get(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    timeout: 15000
  });

  const records = response?.data?.response?.data || [];
  const firstRecord = records[0];

  console.log('Layout read OK');
  console.log(`Layout: ${decodeURIComponent(testLayout)}`);
  console.log(`Records returned: ${records.length}`);

  if (firstRecord?.recordId) {
    console.log(`Sample recordId: ${firstRecord.recordId}`);
  }

  if (firstRecord) {
    console.log('Sample record payload:');
    console.log(JSON.stringify(firstRecord, null, 2));
  } else {
    console.log('No record payload returned from layout read.');
  }

  return {
    layout: decodeURIComponent(testLayout),
    recordCount: records.length,
    sampleRecord: firstRecord || null
  };
}

async function run() {
  try {
    validateEnv();
    console.log('Testing Filemaker API connectivity...');

    const token = await getSessionToken();
    console.log('Session auth OK');

    const result = await testLayoutRead(token);
    console.log('Test result object:');
    console.log(JSON.stringify(result, null, 2));
    console.log('Filemaker API is reachable and responding.');
    process.exit(0);
  } catch (error) {
    const status = error?.response?.status;
    const apiMessage = error?.response?.data?.messages?.[0]?.message;

    console.error('Filemaker API test failed.');
    if (status) console.error(`HTTP status: ${status}`);
    if (apiMessage) console.error(`API message: ${apiMessage}`);
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

run();