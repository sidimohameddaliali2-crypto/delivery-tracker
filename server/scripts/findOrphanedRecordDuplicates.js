// Read-only report: generalizes the Agustin Morales case. Finds every
// MenuSelectionRecord with no `customer` ref (an "orphan" — created either by
// the old manual Auto-Assign flow or the auto-populate job when matching
// missed) whose OWN denormalized name closely matches an existing, properly
// linked Customer elsewhere in the system. That pattern means the same
// person has a real account, and the orphan is a duplicate identity that
// should be deleted (if it's just auto-assigned filler) or reconciled (if it
// has real self-picked meals), not a genuinely new/unmatched customer.
//
// Makes NO changes — only prints candidates for review.
//
// Usage: node scripts/findOrphanedRecordDuplicates.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Customer from '../models/Customer.js';
import MenuSelectionRecord from '../models/MenuSelectionRecord.js';
import WeeklyMenu from '../models/WeeklyMenu.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const normalizeName = (first, last) => [first, last]
  .filter(Boolean)
  .join(' ')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

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
        prevRow[j] + 1,
        currRow[j - 1] + 1,
        prevRow[j - 1] + cost
      ));
    }
    prevRow = currRow;
  }
  return prevRow[n];
};

const isCloseMatch = (nameA, nameB) => {
  if (!nameA || !nameB) return false;
  if (nameA === nameB) return true;
  if (nameA.length >= 4 && nameB.length >= 4 && (nameA.includes(nameB) || nameB.includes(nameA))) return true;
  const distance = levenshtein(nameA, nameB);
  const threshold = Math.max(2, Math.round(Math.max(nameA.length, nameB.length) * 0.15));
  return distance <= threshold;
};

const run = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    const orphans = await MenuSelectionRecord.find({ customer: { $exists: false } })
      .select('_id email firstName lastName weeklyMenuId submittedAt selectedMeals')
      .lean();
    console.log(`Found ${orphans.length} orphaned MenuSelectionRecord(s) (no customer ref).\n`);

    const allCustomers = await Customer.find({})
      .select('customerId firstName lastName email matterSubscriptionId')
      .lean();
    const customersByNormName = new Map();
    for (const c of allCustomers) {
      const key = normalizeName(c.firstName, c.lastName);
      if (!key) continue;
      if (!customersByNormName.has(key)) customersByNormName.set(key, []);
      customersByNormName.get(key).push(c);
    }
    const normNameList = [...customersByNormName.keys()];

    const menuIds = [...new Set(orphans.map((o) => String(o.weeklyMenuId)))];
    const menus = await WeeklyMenu.find({ _id: { $in: menuIds } }).select('title').lean();
    const menuTitleById = new Map(menus.map((m) => [String(m._id), m.title]));

    let flagged = 0;
    const seenOrphanIds = new Set();

    for (const orphan of orphans) {
      const orphanName = normalizeName(orphan.firstName, orphan.lastName);
      if (!orphanName) continue;

      // Exact match first (cheap), then fall back to fuzzy across all names.
      let matches = customersByNormName.get(orphanName) || [];
      if (matches.length === 0) {
        const closeKey = normNameList.find((k) => isCloseMatch(orphanName, k));
        if (closeKey) matches = customersByNormName.get(closeKey);
      }

      // Exclude a "match" that's actually just this same email already
      // being the orphan's own (shouldn't happen since orphans have no
      // customer ref, but keeps this safe if that ever changes).
      matches = matches.filter((m) => String(m.email || '').toLowerCase() !== String(orphan.email || '').toLowerCase());
      if (matches.length === 0) continue;

      flagged += 1;
      seenOrphanIds.add(String(orphan._id));
      const autoCount = (orphan.selectedMeals || []).filter((m) => m.isAutoAssigned).length;
      const totalCount = orphan.selectedMeals?.length || 0;
      console.log(`--- Possible duplicate #${flagged} ---`);
      console.log(`  Orphan record: ${orphan._id} | menu: ${menuTitleById.get(String(orphan.weeklyMenuId)) || orphan.weeklyMenuId}`);
      console.log(`    name: "${orphan.firstName} ${orphan.lastName}" | email: ${orphan.email} | meals: ${totalCount} (${autoCount} auto-assigned) | submitted: ${orphan.submittedAt}`);
      matches.forEach((m) => {
        console.log(`  Likely real identity: ${m.customerId} | "${m.firstName} ${m.lastName}" | ${m.email || '(no email)'} | matterSubscriptionId: ${m.matterSubscriptionId || '(none)'}`);
      });
      console.log('');
    }

    console.log(`— Summary — ${flagged} orphaned record(s) out of ${orphans.length} look like duplicates of an existing customer.`);
    console.log(`${orphans.length - flagged} orphaned record(s) had no name match at all — likely genuinely new/unmatched customers, not duplicates (not shown here).`);
    process.exit(0);
  } catch (error) {
    console.error('✗ Report failed:', error);
    process.exit(1);
  }
};

run();
