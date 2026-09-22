// One-off fix for the 11 shadowed-real-customer cases found by
// findShadowedRealCustomers.js: a bogus/throwaway Customer (created long ago
// directly from an email, e.g. "alex.yacoub") ended up holding the
// matterSubscriptionId link that rightfully belongs to the real customer
// (e.g. CUST-000119751) sharing the same name/phone — because email
// matching outranks phone/name in the cascade, and the bogus record's own
// email trivially matches the subscription it was created from.
//
// For each pair:
//   1. Every MenuSelectionRecord pointing at the bogus customer is checked:
//      - If it's pure auto-assigned filler AND the real customer already has
//        their own record for that same menu -> delete it (noise).
//      - Otherwise (real customer has no record for that menu at all) ->
//        reassign it onto the real customer instead of deleting, since it's
//        their only coverage for that week.
//   2. matterSubscriptionId is cleared from the bogus customer and set on
//      the real one, so future matching (and macro/nutrition lookups)
//      resolve to the correct identity.
//
// Recomputes each affected WeeklyMenu.selectionCount after any deletion.
//
// Usage: node scripts/fixShadowedCustomers.js

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

const PAIRS = [
  ['sarax98', 'CUST-000123490'],
  ['adnan.r.dandan', 'CUST-000123841'],
  ['tatumgreig', 'CUST-000122762'],
  ['jameshovey.contact', 'CUST-000123060'],
  ['umar.farooque', 'CUST-000122234'],
  ['alex.yacoub', 'CUST-000119751'],
  ['charliet78', 'CUST-000120848'],
  ['zutten2233', 'CUST-000118620'],
  ['chantelledocherty94', 'CUST-000123136'],
  ['ttvc94d542', 'CUST-000122880'],
  ['radhika.shanker.marketing', 'CUST-000120686']
];

const run = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    let deleted = 0;
    let reassigned = 0;
    let skippedForReview = 0;
    let linksFixed = 0;

    for (const [bogusId, realId] of PAIRS) {
      const bogus = await Customer.findOne({ customerId: bogusId }).select('_id customerId email matterSubscriptionId').lean();
      const real = await Customer.findOne({ customerId: realId }).select('_id customerId email matterSubscriptionId').lean();
      if (!bogus || !real) {
        console.log(`⚠ Skipping ${bogusId} -> ${realId}: one or both not found (already cleaned up?).`);
        continue;
      }

      const bogusRecords = await MenuSelectionRecord.find({ customer: bogus._id }).lean();
      for (const record of bogusRecords) {
        const allAuto = (record.selectedMeals || []).every((m) => m.isAutoAssigned);
        const realRecord = await MenuSelectionRecord.findOne({ customer: real._id, weeklyMenuId: record.weeklyMenuId }).select('_id').lean();

        if (allAuto && realRecord) {
          console.log(`Deleting bogus record ${record._id} (${bogusId}, menu ${record.weeklyMenuId}) — real customer ${realId} already has their own record ${realRecord._id}.`);
          await MenuSelectionRecord.deleteOne({ _id: record._id });
          const selectionTotal = await MenuSelectionRecord.countDocuments({ weeklyMenuId: record.weeklyMenuId });
          await WeeklyMenu.findByIdAndUpdate(record.weeklyMenuId, { $set: { selectionCount: selectionTotal } });
          deleted += 1;
        } else if (!realRecord) {
          console.log(`Reassigning record ${record._id} (menu ${record.weeklyMenuId}) from ${bogusId} to ${realId} — real customer has no record for this menu, this is their only coverage.`);
          await MenuSelectionRecord.updateOne(
            { _id: record._id },
            { $set: { customer: real._id, email: real.email, customerId: real.customerId } }
          );
          reassigned += 1;
        } else {
          console.log(`⚠ Leaving record ${record._id} (${bogusId}, menu ${record.weeklyMenuId}) untouched — has real (non-auto) meals AND the real customer already has their own record. Needs manual review.`);
          skippedForReview += 1;
        }
      }

      // Transfer the link: clear it from the bogus customer, set it on the
      // real one — the actual fix for macros coming back 0/0/0.
      const subscriptionId = bogus.matterSubscriptionId;
      await Customer.updateOne({ _id: bogus._id }, { $set: { matterSubscriptionId: null } });
      await Customer.updateOne({ _id: real._id }, { $set: { matterSubscriptionId: subscriptionId } });
      console.log(`✓ Transferred matterSubscriptionId ${subscriptionId} from ${bogusId} to ${realId}.\n`);
      linksFixed += 1;
    }

    console.log('— Summary —');
    console.log(`Bogus records deleted (pure noise): ${deleted}`);
    console.log(`Bogus records reassigned (only real coverage): ${reassigned}`);
    console.log(`Left for manual review: ${skippedForReview}`);
    console.log(`Subscription links transferred to the real customer: ${linksFixed}`);
    process.exit(0);
  } catch (error) {
    console.error('✗ Fix failed:', error);
    process.exit(1);
  }
};

run();
