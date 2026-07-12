import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const baseURL = process.env.ATHLEAT_BASE_URL;
const database = process.env.ATHLEAT_DATABASE;
const basicAuth = process.env.ATHLEAT_BASIC_AUTH;

const layoutCandidates = [
  'Customer%3A%20Web%20Data',
  'Leads%3A%20Web%20Data',
  'Lead%3A%20Web%20Data',
  'Order%3A%20Web%20Data',
  'Order%3A%20Schedule%20Meal%20-%20Web%20Data',
  'Menu%3A%20Item%20-%20Web%20Data',
  'Leads',
  'Lead',
  'Lead%20Web%20Data',
  'Leads%20Web%20Data',
  'LeadLayout',
  'Lead%20Layout'
];

function validateEnv() {
  const missing = [];

  if (!baseURL) missing.push('ATHLEAT_BASE_URL');
  if (!database) missing.push('ATHLEAT_DATABASE');
  if (!basicAuth) missing.push('ATHLEAT_BASIC_AUTH');

  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`);
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
    throw new Error('No session token returned by API');
  }

  return token;
}

function buildSimpleSample(record) {
  if (!record) return null;

  const fieldData = record.fieldData || {};
  const fieldKeys = Object.keys(fieldData);
  const previewEntries = fieldKeys.slice(0, 6).map((key) => [key, fieldData[key]]);

  return {
    recordId: record.recordId || null,
    modId: record.modId || null,
    fieldCount: fieldKeys.length,
    fieldsPreview: Object.fromEntries(previewEntries),
    portalNames: Object.keys(record.portalData || {})
  };
}

async function checkLayout(token, layoutName) {
  const url = `${baseURL}/fmi/data/vLatest/databases/${database}/layouts/${layoutName}/records?_limit=1`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      timeout: 15000
    });

    const records = response?.data?.response?.data || [];
    const sampleRecord = records[0] || null;

    return {
      layoutEncoded: layoutName,
      layoutDisplay: decodeURIComponent(layoutName),
      status: 'SUCCESS',
      recordCount: records.length,
      apiMessage: 'OK',
      sample: buildSimpleSample(sampleRecord)
    };
  } catch (error) {
    const apiMessage = error?.response?.data?.messages?.[0]?.message || error.message;
    const statusCode = error?.response?.status || null;
    return {
      layoutEncoded: layoutName,
      layoutDisplay: decodeURIComponent(layoutName),
      status: apiMessage === 'Layout is missing' ? 'MISSING' : 'ERROR',
      recordCount: 0,
      statusCode,
      apiMessage,
      sample: null
    };
  }
}

async function run() {
  try {
    validateEnv();
    console.log('Checking FileMaker layouts...');

    const token = await getSessionToken();
    const results = [];

    for (const layoutName of layoutCandidates) {
      const result = await checkLayout(token, layoutName);
      results.push(result);
      console.log(`[${result.status}] ${result.layoutDisplay} | message: ${result.apiMessage}`);
      if (result.sample) {
        console.log(`  sample: ${JSON.stringify(result.sample)}`);
      }
    }

    const successCount = results.filter((r) => r.status === 'SUCCESS').length;
    const missingCount = results.filter((r) => r.status === 'MISSING').length;
    const errorCount = results.filter((r) => r.status === 'ERROR').length;

    console.log('\nSummary');
    console.log(`Success: ${successCount}`);
    console.log(`Missing: ${missingCount}`);
    console.log(`Error: ${errorCount}`);

    console.log('\nFull results JSON:');
    console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    console.error('Layout check failed:', error.message);
    process.exit(1);
  }
}

run();