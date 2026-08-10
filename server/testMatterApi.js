import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const baseURL = process.env.MATTER_API_BASE_URL;
const token = process.env.MATTER_API_TOKEN;
const testSubscriptionId = process.env.MATTER_TEST_SUBSCRIPTION_ID;

// Pass --write to also exercise the POST /pauses endpoint. Off by default
// because it mutates a real subscription's delivery schedule.
const shouldTestWrite = process.argv.includes('--write');

function validateEnv() {
  const missing = [];

  if (!baseURL) missing.push('MATTER_API_BASE_URL');
  if (!token) missing.push('MATTER_API_TOKEN');
  if (!testSubscriptionId) missing.push('MATTER_TEST_SUBSCRIPTION_ID');

  if (missing.length > 0) {
    console.error('Missing required env vars:', missing.join(', '));
    process.exit(1);
  }
}

function client() {
  return axios.create({
    baseURL,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000
  });
}

async function testListSubscriptions(http) {
  const response = await http.get('/subscriptions', {
    params: { page: 1, page_size: 10 }
  });

  const data = response?.data?.data || response?.data;
  console.log('List subscriptions OK');
  console.log(`Status: ${response.status}`);
  console.log(JSON.stringify(data, null, 2));
}

async function testSingleSubscription(http) {
  const response = await http.get(`/subscriptions/${testSubscriptionId}`);

  console.log('Single subscription OK');
  console.log(`Status: ${response.status}`);
  console.log(JSON.stringify(response.data, null, 2));
}

async function testSubscriptionPauses(http) {
  const response = await http.get(`/subscriptions/${testSubscriptionId}/pauses`);

  console.log('Subscription pauses OK');
  console.log(`Status: ${response.status}`);
  console.log(JSON.stringify(response.data, null, 2));
}

async function testCreatePause(http) {
  const response = await http.post(
    `/subscriptions/${testSubscriptionId}/pauses`,
    {
      paused_days: ['2026-08-11'],
      chosen_days: ['2026-08-26']
    },
    {
      headers: { 'Idempotency-Key': `test-${Date.now()}` }
    }
  );

  console.log('Create pause OK');
  console.log(`Status: ${response.status}`);
  console.log(JSON.stringify(response.data, null, 2));
}

async function run() {
  try {
    validateEnv();
    const http = client();

    console.log('Testing Matter API connectivity...\n');

    console.log('--- GET /subscriptions ---');
    await testListSubscriptions(http);

    console.log(`\n--- GET /subscriptions/${testSubscriptionId} ---`);
    await testSingleSubscription(http);

    console.log(`\n--- GET /subscriptions/${testSubscriptionId}/pauses ---`);
    await testSubscriptionPauses(http);

    if (shouldTestWrite) {
      console.log(`\n--- POST /subscriptions/${testSubscriptionId}/pauses ---`);
      await testCreatePause(http);
    } else {
      console.log('\nSkipping POST /pauses (pass --write to test it — this mutates a real delivery schedule).');
    }

    console.log('\nMatter API is reachable and responding.');
    process.exit(0);
  } catch (error) {
    const status = error?.response?.status;
    const apiMessage = error?.response?.data?.message || error?.response?.data?.code;

    console.error('\nMatter API test failed.');
    if (status) console.error(`HTTP status: ${status}`);
    if (apiMessage) console.error(`API message: ${apiMessage}`);
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

run();
