// One-time follow-up to mergeUnnamedCustomerIntoRealRecord.js (2026-09-29):
// for the real internal Customer records that absorbed a throwaway
// duplicate, their Customer.email is a billing/contact address that differs
// from the email they actually sign into the menu-selection link with. That
// mismatch is WHY the automatic match missed them and spawned a throwaway
// record in the first place — without fixing it, the exact same thing
// happens again on their next selection. This overwrites Customer.email
// with the sign-in email (confirmed by the user to be safe here) for a
// fixed, explicit list of customerId -> email pairs.
//
// Does NOT touch matterSubscriptionId — some of these customers have more
// than one Matter subscription and it's not clear which is current; that
// field is left untouched deliberately.
//
// SAFE BY DEFAULT: dry run unless you pass --apply.
//
// Usage:
//   node scripts/backfillSignInEmailForMergedCustomers.js            (dry run)
//   node scripts/backfillSignInEmailForMergedCustomers.js --apply    (writes)

import '../loadEnv.js';
import mongoose from 'mongoose';
import Customer from '../models/Customer.js';

const APPLY = process.argv.includes('--apply');

// customerId -> sign-in email (from scripts/output/unnamed-email-prefix-customers.csv
// and merge-candidates.csv, 2026-09-29 merge run)
const PAIRS = [
  ['CUST-000120997', 'agustin@crossfitalioth.com'],
  ['CUST-000122578', 'fpts2fqznx@privaterelay.appleid.com'],
  ['CUST-000123640', 'fxfnxrc8z2@privaterelay.appleid.com'],
  ['CUST-000122958', 'noursi.ghassan@gmail.com'],
  ['CUST-000122875', 'pavlinahara@icloud.com'],
  ['CUST-000124012', 'sandilinafarha@gmail.com']
];

const run = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${PAIRS.length} pair(s)\n`);

  for (const [customerId, signInEmail] of PAIRS) {
    const customer = await Customer.findOne({ customerId });
    if (!customer) { console.log(`SKIP  ${customerId}: not found`); continue; }

    const clash = await Customer.findOne({ email: signInEmail, _id: { $ne: customer._id } }).select('customerId');
    if (clash) {
      console.log(`SKIP  ${customerId}: ${signInEmail} is already used by ${clash.customerId} — needs manual review, not touching either record`);
      continue;
    }

    console.log(`${customerId}: email ${customer.email || '(none)'} -> ${signInEmail}`);
    if (APPLY) {
      await Customer.updateOne({ _id: customer._id }, { $set: { email: signInEmail } });
    }
  }

  if (!APPLY) console.log('\nDry run only — nothing was changed. Re-run with --apply to write these changes.');
  await mongoose.disconnect();
};

run().catch((err) => { console.error('Backfill failed:', err); process.exitCode = 1; mongoose.disconnect(); });
