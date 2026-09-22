// Read-only report: every internal Customer whose email differs from their
// Matter API subscription's email — the exact condition that causes
// duplicate customers/selections whenever automatic matching (email/phone/
// name) fails to bridge the two. Fetches full subscription detail (not the
// sparser list/summary row) for accuracy, same reasoning as the
// findSubscriptionsWithDeliveryInRange fix in matterApiService.js.
//
// Makes NO changes.
//
// Usage: node scripts/findEmailMismatches.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
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

const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const run = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    console.log('Fetching all Matter subscriptions (summary)...');
    const allSubs = await matterApiService.listAllSubscriptions();
    // Identity checking doesn't need the cycle_end_date bound that gates
    // kitchen delivery logic (findSubscriptionsWithDeliveryInRange in
    // matterApiService.js) — a past-cycle subscription's identity is still
    // worth surfacing. "cancelled" just means won't renew.
    const candidates = allSubs.filter((s) => ['active', 'paused', 'cancelled'].includes(s.subscription_status));
    console.log(`${candidates.length} active/paused/cancelled subscription(s) of ${allSubs.length} total. Fetching full detail for accurate email/name/phone (this is the slow part — one API call per subscription)...\n`);

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
          phone: detail?.data?.phone || '',
          subscription_status: sub.subscription_status
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

    const mismatches = [];
    const noInternalMatch = [];
    for (const sub of subs) {
      const result = matches.get(String(sub.subscription_id));
      if (!result?.customer) {
        noInternalMatch.push(sub);
        continue;
      }
      const customerEmail = String(result.customer.email || '').trim().toLowerCase();
      const subEmail = String(sub.email || '').trim().toLowerCase();
      if (customerEmail && subEmail && customerEmail !== subEmail) {
        mismatches.push({ customer: result.customer, sub, matchedBy: result.matchedBy });
      }
    }

    mismatches.sort((a, b) => `${a.customer.firstName} ${a.customer.lastName}`.localeCompare(`${b.customer.firstName} ${b.customer.lastName}`));

    console.log(`=== ${mismatches.length} customer(s) with a different Matter API email ===\n`);
    mismatches.forEach(({ customer, sub, matchedBy }) => {
      console.log(`${customer.customerId} | "${customer.firstName} ${customer.lastName}"`);
      console.log(`  internal email: ${customer.email}`);
      console.log(`  Matter email:   ${sub.email}  (subscription ${sub.subscription_id}, matched by: ${matchedBy}, manually linked: ${customer.matterSubscriptionId ? 'yes' : 'NO'})`);
      console.log('');
    });

    const notManuallyLinked = mismatches.filter((m) => !m.customer.matterSubscriptionId);
    console.log('— Summary —');
    console.log(`${mismatches.length} customer(s) have a different email on their Matter subscription than internally.`);
    console.log(`${notManuallyLinked.length} of those are NOT manually linked (relying on automatic email/phone/name matching every time) — higher risk if that auto-match ever misses.`);
    console.log(`${noInternalMatch.length} active/paused Matter subscription(s) matched no internal customer at all (separate issue — not shown here).`);

    const outDir = path.join(__dirname, 'output');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'email-mismatches.csv');
    const header = 'customerId,name,internalEmail,matterEmail,subscriptionId,matchedBy,manuallyLinked\n';
    const rows = mismatches.map(({ customer, sub, matchedBy }) => [
      csvEscape(customer.customerId),
      csvEscape(`${customer.firstName} ${customer.lastName}`),
      csvEscape(customer.email),
      csvEscape(sub.email),
      csvEscape(sub.subscription_id),
      csvEscape(matchedBy),
      csvEscape(customer.matterSubscriptionId ? 'yes' : 'no')
    ].join(',')).join('\n');
    fs.writeFileSync(outPath, header + rows + '\n');
    console.log(`\nCSV written to: ${outPath}`);

    process.exit(0);
  } catch (error) {
    console.error('✗ Report failed:', error);
    process.exit(1);
  }
};

run();
