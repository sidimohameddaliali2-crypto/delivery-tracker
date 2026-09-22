// One-off cleanup for the specific Agustin Morales duplicate identity found
// via diagnoseCustomerDuplicates.js ("morales"). Deletes three orphaned
// MenuSelectionRecord documents (email: agustin@crossfitalioth.com, no
// Customer link) per the user's explicit decision:
//   - Sep 14-20 and Sep 21-27: pure auto-assigned filler, created only
//     because matching missed her real selection under her linked account.
//   - Aug 10-16: a genuine duplicate self-submission — keeping the fuller
//     15-item selection under her linked account (lagustinmorales95@gmail.com),
//     deleting the 3-item one.
// Recomputes each affected WeeklyMenu.selectionCount after deleting, same as
// the live select-meals route does.
//
// Hardcoded, specific record IDs — deliberately not a generic "find and
// delete" query, so this can only ever touch exactly the records reviewed.

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import MenuSelectionRecord from '../models/MenuSelectionRecord.js';
import WeeklyMenu from '../models/WeeklyMenu.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const RECORD_IDS_TO_DELETE = [
  '6aaa73b217328210bb03e6bf', // Sep 14-20 orphan, all auto-assigned
  '6aad2c8e4b64d93a48c3dd2a', // Sep 21-27 orphan, all auto-assigned
  '6a75cc1f037ee5cc5bd2a795'  // Aug 10-16 orphan, 3-item duplicate submission
];

const run = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    for (const id of RECORD_IDS_TO_DELETE) {
      const record = await MenuSelectionRecord.findById(id).lean();
      if (!record) {
        console.log(`⚠ Record ${id} not found (already deleted?) — skipping.`);
        continue;
      }

      console.log(`Deleting record ${id} (email: ${record.email}, ${record.selectedMeals?.length || 0} meal(s), weeklyMenuId: ${record.weeklyMenuId})...`);
      await MenuSelectionRecord.deleteOne({ _id: id });

      const selectionTotal = await MenuSelectionRecord.countDocuments({ weeklyMenuId: record.weeklyMenuId });
      await WeeklyMenu.findByIdAndUpdate(record.weeklyMenuId, { $set: { selectionCount: selectionTotal } });
      console.log(`  ✓ Deleted. Menu ${record.weeklyMenuId} selectionCount updated to ${selectionTotal}.`);
    }

    console.log('\n✓ Cleanup complete.');
    process.exit(0);
  } catch (error) {
    console.error('✗ Cleanup failed:', error);
    process.exit(1);
  }
};

run();
