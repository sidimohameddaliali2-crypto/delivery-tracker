// Read-only report: finds Customer records auto-created by the Kitchen
// auto-populate job (server/routes/menus.js, createCustomerFromMatterSubscription
// in customerMatchService.js — these are tagged dataSource: 'MatterApi')
// whose name closely matches an existing, different customer. That pattern
// means the automatic match (by manual link / email / phone / name) missed
// a real existing customer and created a duplicate instead — usually because
// of a formatting difference in how the name is stored (extra space, name
// split differently across firstName/lastName, etc).
//
// This script makes NO changes — it only prints candidates for a human to
// review and fix via Customer Management's "Internal Customer Match" panel.
//
// Usage: node scripts/findAutoCreatedDuplicateCustomers.js

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

// Standard edit distance — cheap enough here since only auto-created
// customers (usually a small set) are compared against the full list.
const levenshtein = (a, b) => {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prevRow = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const currRow = [i];
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow.push(Math.min(
        prevRow[j] + 1,      // deletion
        currRow[j - 1] + 1,  // insertion
        prevRow[j - 1] + cost // substitution
      ));
    }
    prevRow = currRow;
  }
  return prevRow[n];
};

const isCloseMatch = (nameA, nameB) => {
  if (!nameA || !nameB) return false;
  if (nameA === nameB) return true;
  if (nameA.includes(nameB) || nameB.includes(nameA)) return true;
  const distance = levenshtein(nameA, nameB);
  const threshold = Math.max(2, Math.round(Math.max(nameA.length, nameB.length) * 0.15));
  return distance <= threshold;
};

const run = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    const allCustomers = await Customer.find({})
      .select('customerId firstName lastName email dataSource matterSubscriptionId createdAt')
      .lean();

    const autoCreated = allCustomers.filter((c) => c.dataSource === 'MatterApi');
    console.log(`Found ${autoCreated.length} auto-created customer(s) (dataSource: 'MatterApi') out of ${allCustomers.length} total.\n`);

    if (autoCreated.length === 0) {
      console.log('Nothing to check.');
      process.exit(0);
    }

    let reportedGroups = 0;

    for (const candidate of autoCreated) {
      const candidateName = normalizeName(candidate.firstName, candidate.lastName);
      if (!candidateName) continue;

      const matches = allCustomers.filter((other) => {
        if (String(other._id) === String(candidate._id)) return false;
        const otherName = normalizeName(other.firstName, other.lastName);
        return isCloseMatch(candidateName, otherName);
      });

      if (matches.length === 0) continue;

      reportedGroups += 1;
      console.log(`--- Possible duplicate #${reportedGroups} ---`);
      console.log(`  Auto-created: ${candidate.customerId} | "${candidate.firstName} ${candidate.lastName}" | ${candidate.email || '(no email)'} | matterSubscriptionId: ${candidate.matterSubscriptionId || '(none)'} | created ${candidate.createdAt?.toISOString?.() || candidate.createdAt}`);
      matches.forEach((m) => {
        console.log(`  Existing:      ${m.customerId} | "${m.firstName} ${m.lastName}" | ${m.email || '(no email)'} | matterSubscriptionId: ${m.matterSubscriptionId || '(none)'} | dataSource: ${m.dataSource || '(unset)'}`);
      });
      console.log('');
    }

    console.log(`— Summary — ${reportedGroups} possible duplicate group(s) out of ${autoCreated.length} auto-created customer(s) checked.`);
    console.log('Nothing was changed. Review each group and, where it\'s the same real person, link the correct existing customer to the Matter subscription via Customer Management\'s "Internal Customer Match" panel, then deactivate/delete the bogus auto-created one.');
    process.exit(0);
  } catch (error) {
    console.error('✗ Report failed:', error);
    process.exit(1);
  }
};

run();
