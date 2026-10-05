// One-time backfill: save Matter's permanent customer id (Customer.matterCustomerId)
// on every internal Customer that is already linked to a LIVE Matter subscription.
//
// Matter's subscription id changes on every renewal (leaving
// Customer.matterSubscriptionId dead); its customer id never does. After this
// runs, lookups go through the customer id and re-point the subscription id
// themselves (see services/matterNutritionLookup.js).
//
// Usage (from server/):
//   node scripts/backfillMatterCustomerId.js            # dry run — prints what it WOULD do
//   node scripts/backfillMatterCustomerId.js --apply    # writes matterCustomerId (and re-points dead subscription ids found by email)
//
// Only ever sets matterCustomerId, plus matterSubscriptionId when the stored one
// is dead and the customer's email finds exactly one live subscription. Never
// clears or overwrites a live link.
import '../loadEnv.js';
import mongoose from 'mongoose';
import Customer from '../models/Customer.js';
import matterApiService from '../services/matterApiService.js';

const apply = process.argv.includes('--apply');

await mongoose.connect(process.env.MONGODB_URI);

const all = await matterApiService.listAllSubscriptions();
const bySubscriptionId = new Map(all.map((sub) => [String(sub.subscription_id), sub]));
const byEmail = new Map();
for (const sub of all) {
  const email = String(sub.email || '').trim().toLowerCase();
  if (!email) continue;
  if (!byEmail.has(email)) byEmail.set(email, []);
  byEmail.get(email).push(sub);
}

const customers = await Customer.find({}).select('email firstName lastName matterSubscriptionId matterCustomerId').lean();

const plan = { alreadySet: 0, setFromLiveLink: [], repointedByEmail: [], noLiveSubscription: 0 };
const subscriptionIdsTaken = new Set(customers.map((c) => String(c.matterSubscriptionId || '')).filter(Boolean));

for (const customer of customers) {
  if (customer.matterCustomerId) { plan.alreadySet += 1; continue; }

  const linked = customer.matterSubscriptionId ? bySubscriptionId.get(String(customer.matterSubscriptionId)) : null;
  if (linked) {
    plan.setFromLiveLink.push({ _id: customer._id, matterCustomerId: String(linked.customer_id), label: `${customer.firstName || ''} ${customer.lastName || ''} <${customer.email}>` });
    continue;
  }

  // Dead or missing link: only trust an email that finds exactly one live subscription
  // that no other internal customer already holds.
  const viaEmail = byEmail.get(String(customer.email || '').trim().toLowerCase()) || [];
  if (viaEmail.length === 1 && !subscriptionIdsTaken.has(String(viaEmail[0].subscription_id))) {
    plan.repointedByEmail.push({
      _id: customer._id,
      matterCustomerId: String(viaEmail[0].customer_id),
      matterSubscriptionId: String(viaEmail[0].subscription_id),
      label: `${customer.firstName || ''} ${customer.lastName || ''} <${customer.email}> (was ${customer.matterSubscriptionId || 'none'})`
    });
    subscriptionIdsTaken.add(String(viaEmail[0].subscription_id));
  } else {
    plan.noLiveSubscription += 1;
  }
}

console.log(`Matter live subscriptions: ${all.length} | internal customers: ${customers.length}`);
console.log(`  already have matterCustomerId:        ${plan.alreadySet}`);
console.log(`  will set from their live link:        ${plan.setFromLiveLink.length}`);
console.log(`  will re-point (dead link, email hit): ${plan.repointedByEmail.length}`);
plan.repointedByEmail.forEach((row) => console.log(`      ${row.label} -> sub ${row.matterSubscriptionId}, customer ${row.matterCustomerId}`));
console.log(`  no live Matter subscription (left alone): ${plan.noLiveSubscription}`);

if (!apply) {
  console.log('\nDry run — nothing written. Re-run with --apply to write.');
} else {
  let written = 0;
  for (const row of plan.setFromLiveLink) {
    await Customer.updateOne({ _id: row._id }, { $set: { matterCustomerId: row.matterCustomerId } });
    written += 1;
  }
  for (const row of plan.repointedByEmail) {
    try {
      await Customer.updateOne({ _id: row._id }, { $set: { matterCustomerId: row.matterCustomerId, matterSubscriptionId: row.matterSubscriptionId } });
      written += 1;
    } catch (error) {
      console.error(`  skipped ${row.label}: ${error.message}`);
    }
  }
  console.log(`\nWrote ${written} customer record(s).`);
}

await mongoose.disconnect();
process.exit(0);
