// Cleans up orphaned MenuSelectionRecord duplicates that are PURE
// auto-assigned filler (every meal isAutoAssigned:true, nothing self-picked)
// AND whose denormalized name EXACTLY matches an existing, real Customer
// (deliberately not fuzzy — see findOrphanedRecordDuplicates.js's false
// positive on "Jane James" vs "Dan James"; exact-only avoids that class of
// mistake here).
//
// Before deleting anything, verifies the real customer already has their OWN
// MenuSelectionRecord (customer ref set to them) for that SAME weeklyMenuId
// with at least one real (non-auto-assigned) meal. Only then is the orphan
// considered pure noise and deleted; otherwise it's left alone and logged
// for manual review, since deleting it would leave that person with nothing
// selected for that week at all — worse than a stray duplicate.
//
// Recomputes each affected WeeklyMenu.selectionCount after any deletion.
//
// Usage: node scripts/verifyAndCleanupAutoAssignedDuplicates.js

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

const run = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    const orphans = await MenuSelectionRecord.find({ customer: { $exists: false } })
      .select('_id email firstName lastName weeklyMenuId selectedMeals')
      .lean();

    // Pure auto-assigned filler only — every meal isAutoAssigned, and at
    // least one meal exists (an empty record isn't a duplicate of anything).
    const pureAutoOrphans = orphans.filter((o) => {
      const meals = o.selectedMeals || [];
      return meals.length > 0 && meals.every((m) => m.isAutoAssigned);
    });
    console.log(`${pureAutoOrphans.length} orphan record(s) are pure auto-assigned filler (out of ${orphans.length} total orphans).\n`);

    const allCustomers = await Customer.find({}).select('customerId firstName lastName').lean();
    const customersByExactName = new Map();
    for (const c of allCustomers) {
      const key = normalizeName(c.firstName, c.lastName);
      if (!key) continue;
      if (!customersByExactName.has(key)) customersByExactName.set(key, []);
      customersByExactName.get(key).push(c);
    }

    let deleted = 0;
    let skippedNoMatch = 0;
    let skippedNoRealCoverage = 0;
    let skippedAmbiguous = 0;

    for (const orphan of pureAutoOrphans) {
      const orphanName = normalizeName(orphan.firstName, orphan.lastName);
      const candidates = customersByExactName.get(orphanName) || [];

      if (candidates.length === 0) {
        skippedNoMatch += 1;
        continue;
      }
      if (candidates.length > 1) {
        console.log(`⚠ Skipping "${orphan.firstName} ${orphan.lastName}" (${orphan._id}) — ${candidates.length} customers share this exact name, ambiguous which is real. Needs manual review.`);
        skippedAmbiguous += 1;
        continue;
      }

      const realCustomer = candidates[0];
      const realRecord = await MenuSelectionRecord.findOne({
        weeklyMenuId: orphan.weeklyMenuId,
        customer: realCustomer._id
      }).select('selectedMeals').lean();

      const hasRealCoverage = (realRecord?.selectedMeals || []).some((m) => !m.isAutoAssigned);
      if (!hasRealCoverage) {
        console.log(`⚠ Skipping "${orphan.firstName} ${orphan.lastName}" (${orphan._id}) — real customer ${realCustomer.customerId} has no confirmed selection for this menu yet. Needs manual review, not deleting.`);
        skippedNoRealCoverage += 1;
        continue;
      }

      console.log(`Deleting orphan ${orphan._id} ("${orphan.firstName} ${orphan.lastName}", ${orphan.selectedMeals.length} auto-assigned meal(s)) — real customer ${realCustomer.customerId} already has ${realRecord.selectedMeals.filter((m) => !m.isAutoAssigned).length} confirmed meal(s) for this menu.`);
      await MenuSelectionRecord.deleteOne({ _id: orphan._id });
      const selectionTotal = await MenuSelectionRecord.countDocuments({ weeklyMenuId: orphan.weeklyMenuId });
      await WeeklyMenu.findByIdAndUpdate(orphan.weeklyMenuId, { $set: { selectionCount: selectionTotal } });
      deleted += 1;
    }

    console.log(`\n— Summary —`);
    console.log(`Deleted: ${deleted}`);
    console.log(`Skipped — no exact name match (likely genuinely unmatched customers): ${skippedNoMatch}`);
    console.log(`Skipped — ambiguous (multiple customers share the exact name): ${skippedAmbiguous}`);
    console.log(`Skipped — real customer has no confirmed coverage yet (needs manual review): ${skippedNoRealCoverage}`);
    process.exit(0);
  } catch (error) {
    console.error('✗ Cleanup failed:', error);
    process.exit(1);
  }
};

run();
