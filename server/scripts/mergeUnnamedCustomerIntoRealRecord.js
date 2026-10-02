// Merges a throwaway auto-created Customer (customerId === email local-part,
// no name — see findUnnamedEmailPrefixCustomers.js) into the real internal
// Customer record it actually belongs to, then deletes the throwaway one.
//
// Reads scripts/output/merge-candidates.csv (from
// findMergeCandidatesForUnnamedCustomers.js) and acts ONLY on rows where the
// `confirmed` column is exactly "yes" — fill that in by hand after reviewing
// the candidates yourself. Nothing here re-guesses a match.
//
// SAFE BY DEFAULT: dry run unless you pass --apply. Dry run prints exactly
// what would move and what would be skipped — no writes, ever, without
// --apply.
//
// What it does per confirmed pair (throwawayCustomerId -> candidateCustomerId):
//   1. Reassigns every MenuSelectionRecord.customer from the throwaway to the
//      real customer's _id (and refreshes the denormalized customerId/
//      firstName/lastName snapshot fields to the real customer's).
//   2. Skips (does not move, does not delete anything for that pair) any
//      MenuSelectionRecord that would collide with the real customer's
//      existing unique (weeklyMenuId, customer) — i.e. the real customer
//      already has their own selection for that same week. These need a
//      human to decide which selection is correct; reported, not resolved.
//   3. Deletes the throwaway Customer only if EVERY one of its selections
//      moved cleanly (zero remaining MenuSelectionRecord docs pointing at
//      it). If any were skipped for a conflict, the throwaway record is left
//      in place (with only the conflicting selection still attached) so
//      nothing is lost.
//
// Usage:
//   node scripts/mergeUnnamedCustomerIntoRealRecord.js            (dry run)
//   node scripts/mergeUnnamedCustomerIntoRealRecord.js --apply    (writes)

import '../loadEnv.js';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Customer from '../models/Customer.js';
import MenuSelectionRecord from '../models/MenuSelectionRecord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');

const parseCsv = (text) => {
  const lines = text.split('\n').filter((l) => l.trim());
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || [])
      .filter((c) => c !== '')
      .map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
};

const run = async () => {
  const csvPath = path.join(__dirname, 'output', 'merge-candidates.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`Not found: ${csvPath}\nRun findMergeCandidatesForUnnamedCustomers.js first, review it, and fill in "confirmed" = yes on the correct rows.`);
    process.exitCode = 1;
    return;
  }
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const confirmed = rows.filter((r) => String(r.confirmed || '').trim().toLowerCase() === 'yes');

  if (confirmed.length === 0) {
    console.log('No rows marked confirmed="yes" in merge-candidates.csv — nothing to do.');
    console.log('Open the CSV, put "yes" in the confirmed column for the correct pair(s), and re-run.');
    return;
  }

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${confirmed.length} confirmed pair(s)\n`);

  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI);

  for (const row of confirmed) {
    const throwaway = await Customer.findOne({ customerId: row.throwawayCustomerId });
    const real = await Customer.findOne({ customerId: row.candidateCustomerId });

    if (!throwaway) { console.log(`SKIP  ${row.throwawayCustomerId}: throwaway customer not found (already merged?)`); continue; }
    if (!real) { console.log(`SKIP  ${row.throwawayCustomerId} -> ${row.candidateCustomerId}: candidate customer not found`); continue; }
    if (String(throwaway._id) === String(real._id)) { console.log(`SKIP  ${row.throwawayCustomerId}: throwaway and candidate are the same record`); continue; }

    const selections = await MenuSelectionRecord.find({ customer: throwaway._id });
    if (selections.length === 0) {
      console.log(`${row.throwawayCustomerId} -> ${row.candidateCustomerId}: no selections attached — would just delete the empty throwaway record`);
      if (APPLY) await Customer.deleteOne({ _id: throwaway._id });
      continue;
    }

    let moved = 0;
    let skippedConflicts = 0;
    for (const sel of selections) {
      const conflict = await MenuSelectionRecord.findOne({
        weeklyMenuId: sel.weeklyMenuId,
        customer: real._id,
        _id: { $ne: sel._id }
      });
      if (conflict) {
        skippedConflicts += 1;
        console.log(`  CONFLICT week ${sel.weeklyMenuId}: real customer ${row.candidateCustomerId} already has selection ${conflict._id} — leaving ${sel._id} attached to the throwaway record for manual review`);
        continue;
      }
      console.log(`  MOVE selection ${sel._id} (week ${sel.weeklyMenuId}) from ${row.throwawayCustomerId} -> ${row.candidateCustomerId}`);
      if (APPLY) {
        await MenuSelectionRecord.updateOne(
          { _id: sel._id },
          { $set: { customer: real._id, customerId: real.customerId, firstName: real.firstName, lastName: real.lastName } }
        );
      }
      moved += 1;
    }

    if (skippedConflicts === 0) {
      console.log(`${row.throwawayCustomerId} -> ${row.candidateCustomerId}: ${moved} selection(s) moved, throwaway record would be deleted`);
      if (APPLY) await Customer.deleteOne({ _id: throwaway._id });
    } else {
      console.log(`${row.throwawayCustomerId} -> ${row.candidateCustomerId}: ${moved} moved, ${skippedConflicts} conflict(s) — throwaway record KEPT (not deleted) until those are resolved by hand`);
    }
    console.log('');
  }

  if (!APPLY) console.log('Dry run only — nothing was changed. Re-run with --apply to write these changes.');
  await mongoose.disconnect();
};

run().catch((err) => { console.error('Merge failed:', err); process.exitCode = 1; mongoose.disconnect(); });
