// Read-only report: finds cases where a Matter subscription's manual link
// (Customer.matterSubscriptionId) points at a bogus/throwaway Customer
// (created directly from an email prefix or Matter's raw numeric
// customer_id, e.g. "alex.yacoub" or "1821" — never a proper "CUST-XXXXXX"
// id) instead of the real, pre-existing Customer with the same name/phone.
// Because manual link is the highest-priority match in
// customerMatchService's cascade, the real customer becomes permanently
// unmatchable for that subscription once this happens — exactly why several
// customers kept coming up 0/0/0 on macros even after the broader backfill.
//
// Makes NO changes — only prints candidates for review.
//
// Usage: node scripts/findShadowedRealCustomers.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Customer from '../models/Customer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const normalizeName = (first, last) => [first, last]
  .filter(Boolean)
  .join(' ')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

const normalizePhoneDigits = (value) => String(value || '').replace(/\D/g, '');
const phoneSuffix = (value, len = 9) => normalizePhoneDigits(value).slice(-len);

// A "real" customerId always looks like CUST-XXXXXX. Anything else (an
// email prefix, a bare Matter numeric id, etc.) is a throwaway created by
// the old inline customer-creation paths.
const looksLikeRealCustomerId = (id) => /^CUST-\d+$/i.test(String(id || ''));

const run = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    const linked = await Customer.find({ matterSubscriptionId: { $nin: [null, ''] } })
      .select('customerId firstName lastName email phone matterSubscriptionId')
      .lean();
    const bogusLinked = linked.filter((c) => !looksLikeRealCustomerId(c.customerId));
    console.log(`${linked.length} customer(s) have a matterSubscriptionId set; ${bogusLinked.length} of those are throwaway-looking records (not CUST-XXXXXX).\n`);

    const allCustomers = await Customer.find({})
      .select('customerId firstName lastName email phone matterSubscriptionId')
      .lean();
    const byName = new Map();
    const byPhone = new Map();
    for (const c of allCustomers) {
      const name = normalizeName(c.firstName, c.lastName);
      if (name) {
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push(c);
      }
      const suffix = phoneSuffix(c.phone);
      if (suffix) {
        if (!byPhone.has(suffix)) byPhone.set(suffix, []);
        byPhone.get(suffix).push(c);
      }
    }

    let flagged = 0;
    for (const bogus of bogusLinked) {
      const name = normalizeName(bogus.firstName, bogus.lastName);
      const suffix = phoneSuffix(bogus.phone);
      const nameMatches = (byName.get(name) || []).filter((c) => c.customerId !== bogus.customerId && looksLikeRealCustomerId(c.customerId));
      const phoneMatches = (byPhone.get(suffix) || []).filter((c) => c.customerId !== bogus.customerId && looksLikeRealCustomerId(c.customerId));
      const realCandidates = [...new Map([...nameMatches, ...phoneMatches].map((c) => [c.customerId, c])).values()];

      if (realCandidates.length === 0) continue;

      flagged += 1;
      console.log(`--- Shadowed real customer #${flagged} ---`);
      console.log(`  Bogus (holds the link): ${bogus.customerId} | "${bogus.firstName} ${bogus.lastName}" | ${bogus.email} | matterSubscriptionId: ${bogus.matterSubscriptionId}`);
      realCandidates.forEach((real) => {
        console.log(`  Real customer (shadowed): ${real.customerId} | "${real.firstName} ${real.lastName}" | ${real.email} | matterSubscriptionId: ${real.matterSubscriptionId || '(none)'}`);
      });
      console.log('');
    }

    console.log(`— Summary — ${flagged} bogus record(s) are shadowing a real customer's subscription link.`);
    process.exit(0);
  } catch (error) {
    console.error('✗ Report failed:', error);
    process.exit(1);
  }
};

run();
