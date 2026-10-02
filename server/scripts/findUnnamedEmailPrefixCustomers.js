// Read-only report: internal Customers created with no real name captured —
// the exact signature is customerId === email.split('@')[0] (see
// server/routes/menus.js POST /customers/:email/select-meals, the fallback
// `new Customer({ email: cleanEmail, customerId: cleanEmail.split('@')[0] })`
// when resolveCustomerMatch finds nothing) AND firstName/lastName both
// blank. That blank name is what makes Kitchen List/Counting show them as
// "Unknown" (client/src/lib/kitchenData.js getCustomerName falls through to
// entry.email, but several raw-entry.customerName reads elsewhere show
// "Unknown"/"Unknown customer" once neither firstName/lastName nor a
// resolved customerName exists).
//
// For each match, this also checks Matter for a subscription under the
// same email:
//   - a subscription IS found under this email  -> the customer just never
//     had their name backfilled; report Matter's real name for reference,
//     no email change needed.
//   - a subscription is found under matterSubscriptionId but its Matter
//     email differs from the internal email -> likely candidate for the
//     "update internal email to match Matter" fix.
//   - no subscription found at all -> can't auto-resolve; needs a human to
//     find the right account (phone, name search, etc).
//
// Makes NO changes.
//
// Usage: node scripts/findUnnamedEmailPrefixCustomers.js

import '../loadEnv.js';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Customer from '../models/Customer.js';
import MenuSelectionRecord from '../models/MenuSelectionRecord.js';
import matterApiService from '../services/matterApiService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected (read-only). Scanning customers...\n');

  const candidates = await Customer.find({
    email: { $type: 'string', $ne: '' },
    $or: [{ firstName: { $in: [null, ''] } }, { firstName: { $exists: false } }],
    $and: [{ $or: [{ lastName: { $in: [null, ''] } }, { lastName: { $exists: false } }] }]
  })
    .select('customerId email firstName lastName phone matterSubscriptionId createdAt')
    .lean();

  const flagged = candidates.filter((c) => {
    const localPart = String(c.email || '').split('@')[0].trim().toLowerCase();
    return localPart && String(c.customerId || '').trim().toLowerCase() === localPart;
  });

  console.log(`Customers with blank name: ${candidates.length}`);
  console.log(`...of those, customerId === email local-part (the auto-created-with-no-name signature): ${flagged.length}\n`);

  if (flagged.length === 0) {
    console.log('Nothing to report.');
    await mongoose.disconnect();
    return;
  }

  const rows = await mapWithConcurrency(flagged, 5, async (c) => {
    const selectionCount = await MenuSelectionRecord.countDocuments({ customer: c._id });
    const lastSelection = await MenuSelectionRecord.findOne({ customer: c._id })
      .sort({ submittedAt: -1 })
      .select('submittedAt weeklyMenuId')
      .lean();

    let matterEmail = '';
    let matterName = '';
    let matterSubscriptionId = c.matterSubscriptionId || '';
    let matterLookup = 'not attempted';

    try {
      if (c.matterSubscriptionId) {
        const detail = await matterApiService.getSubscription(c.matterSubscriptionId);
        const sub = detail?.data;
        if (sub) {
          matterEmail = String(sub.email || '').trim().toLowerCase();
          matterName = String(sub.name || '').trim();
          matterLookup = 'found via linked matterSubscriptionId';
        } else {
          matterLookup = 'matterSubscriptionId set but subscription not found';
        }
      } else {
        const list = await matterApiService.listSubscriptions({ email: c.email, pageSize: 1 });
        const match = list?.data?.[0];
        if (match) {
          const detail = await matterApiService.getSubscription(match.subscription_id);
          const sub = detail?.data;
          matterEmail = String(sub?.email || '').trim().toLowerCase();
          matterName = String(sub?.name || '').trim();
          matterSubscriptionId = match.subscription_id;
          matterLookup = 'found by searching Matter for this email';
        } else {
          matterLookup = 'no Matter subscription found under this email';
        }
      }
    } catch (err) {
      matterLookup = `Matter lookup failed: ${err.message}`;
    }

    const internalEmail = String(c.email || '').trim().toLowerCase();
    const emailsMatch = matterEmail ? (matterEmail === internalEmail ? 'yes' : 'no') : '';
    let recommendedAction = '';
    if (matterLookup === 'no Matter subscription found under this email') {
      recommendedAction = 'needs manual lookup (phone/name) — no Matter match by email';
    } else if (emailsMatch === 'no') {
      recommendedAction = `update internal email to Matter's: ${matterEmail}`;
    } else if (emailsMatch === 'yes') {
      recommendedAction = 'email already correct — just backfill firstName/lastName from Matter';
    }

    return {
      mongoId: String(c._id),
      customerId: c.customerId,
      internalEmail,
      firstName: c.firstName || '',
      lastName: c.lastName || '',
      phone: c.phone || '',
      createdAt: c.createdAt ? new Date(c.createdAt).toISOString().slice(0, 10) : '',
      selectionCount,
      lastSelectionAt: lastSelection?.submittedAt ? new Date(lastSelection.submittedAt).toISOString().slice(0, 10) : '',
      lastWeeklyMenuId: lastSelection?.weeklyMenuId ? String(lastSelection.weeklyMenuId) : '',
      matterSubscriptionId,
      matterEmail,
      matterName,
      emailsMatch,
      matterLookup,
      recommendedAction
    };
  });

  const outDir = path.join(__dirname, 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'unnamed-email-prefix-customers.csv');
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(','))].join('\n');
  fs.writeFileSync(outFile, csv);

  console.log('customerId'.padEnd(24), 'internalEmail'.padEnd(30), 'sel#'.padEnd(5), 'matterEmail'.padEnd(30), 'match'.padEnd(6), 'action');
  rows.forEach((r) => {
    console.log(
      String(r.customerId).padEnd(24),
      String(r.internalEmail).padEnd(30),
      String(r.selectionCount).padEnd(5),
      String(r.matterEmail || '-').padEnd(30),
      String(r.emailsMatch || '-').padEnd(6),
      r.recommendedAction
    );
  });

  const needsEmailFix = rows.filter((r) => r.emailsMatch === 'no').length;
  const needsManual = rows.filter((r) => r.matterLookup === 'no Matter subscription found under this email').length;
  const justNeedsName = rows.filter((r) => r.emailsMatch === 'yes').length;

  console.log(`\nTotal flagged: ${rows.length}`);
  console.log(`  Email mismatch (fixable by updating internal email to Matter's): ${needsEmailFix}`);
  console.log(`  Email already matches Matter (just missing a name): ${justNeedsName}`);
  console.log(`  No Matter match found by email at all (needs manual lookup): ${needsManual}`);
  console.log(`\nFull report: ${outFile}`);

  await mongoose.disconnect();
};

run().catch((err) => { console.error('Report failed:', err); process.exitCode = 1; mongoose.disconnect(); });
