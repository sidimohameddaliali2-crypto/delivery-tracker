// One-off backfill: for every active/paused Matter subscription that
// resolves to an internal Customer via email/phone/name (NOT already
// manually linked), persist that match onto Customer.matterSubscriptionId
// right now — instead of waiting for runAutoPopulateMissing (server/routes/
// menus.js) to discover and save it naturally as each customer's delivery
// date comes up.
//
// This is the same persist-on-discovery logic runAutoPopulateMissing now
// does automatically going forward; this script just applies it immediately
// to the current customer base so nutrition/macro lookups (Kitchen List/
// Counting) stop coming back 0/0/0 for customers whose internal email
// doesn't match their Matter subscription email but who were never manually
// linked in Customer Management.
//
// Usage: node scripts/linkAutoMatchedCustomers.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Customer from '../models/Customer.js';
import matterApiService from '../services/matterApiService.js';
import { resolveCustomerMatchBulk } from '../services/customerMatchService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mapWithConcurrency = async (items, limit, mapper) => {
  const results = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current], current);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

const run = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    console.log('Fetching all Matter subscriptions (summary)...');
    const allSubs = await matterApiService.listAllSubscriptions();
    // Identity linking doesn't need the cycle_end_date bound that gates
    // kitchen delivery logic (findSubscriptionsWithDeliveryInRange in
    // matterApiService.js) — a past-cycle subscription's identity is still
    // worth linking retroactively. "cancelled" just means won't renew.
    const candidates = allSubs.filter((s) => ['active', 'paused', 'cancelled'].includes(s.subscription_status));
    console.log(`${candidates.length} active/paused/cancelled subscription(s) of ${allSubs.length} total. Fetching full detail...\n`);

    let done = 0;
    const detailed = await mapWithConcurrency(candidates, 15, async (sub) => {
      try {
        const detail = await matterApiService.getSubscription(sub.subscription_id);
        done += 1;
        if (done % 100 === 0) console.log(`  ...${done}/${candidates.length}`);
        return {
          subscription_id: sub.subscription_id,
          customer_id: sub.customer_id,
          name: detail?.data?.name || sub.name,
          email: detail?.data?.email || sub.email,
          phone: detail?.data?.phone || ''
        };
      } catch (err) {
        return null;
      }
    });
    const subs = detailed.filter(Boolean);
    console.log(`✓ Fetched detail for ${subs.length} of ${candidates.length} subscription(s).\n`);

    const customers = await Customer.find({})
      .select('customerId firstName lastName email phone matterSubscriptionId')
      .lean();

    const matches = resolveCustomerMatchBulk(customers, subs);

    let linked = 0;
    let skippedCollision = 0;
    let alreadyLinked = 0;

    for (const sub of subs) {
      const result = matches.get(String(sub.subscription_id));
      if (!result?.customer || !result.matchedBy || result.matchedBy === 'manual') continue;
      if (result.customer.matterSubscriptionId) {
        alreadyLinked += 1;
        continue;
      }

      try {
        const updateResult = await Customer.updateOne(
          { _id: result.customer._id, $or: [{ matterSubscriptionId: null }, { matterSubscriptionId: '' }, { matterSubscriptionId: { $exists: false } }] },
          { $set: { matterSubscriptionId: String(sub.subscription_id) } }
        );
        if (updateResult.modifiedCount > 0) {
          console.log(`✓ Linked ${result.customer.customerId} ("${result.customer.firstName} ${result.customer.lastName}") -> subscription ${sub.subscription_id} (matched by: ${result.matchedBy})`);
          linked += 1;
        }
      } catch (linkError) {
        console.log(`⚠ Could not link ${result.customer.customerId} -> subscription ${sub.subscription_id}: ${linkError.message}`);
        skippedCollision += 1;
      }
    }

    console.log('\n— Summary —');
    console.log(`Linked: ${linked}`);
    console.log(`Already linked (skipped): ${alreadyLinked}`);
    console.log(`Failed (index collision, logged above): ${skippedCollision}`);
    process.exit(0);
  } catch (error) {
    console.error('✗ Backfill failed:', error);
    process.exit(1);
  }
};

run();
