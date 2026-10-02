// Read-only report: for each throwaway Customer flagged by
// findUnnamedEmailPrefixCustomers.js (customerId === email local-part, no
// firstName/lastName — created by the select-meals fallback in
// server/routes/menus.js when resolveCustomerMatch found nothing), search
// ALL other internal customers for a likely "this is actually the same
// person" match, using their real name from Matter (already known from the
// prior report) plus phone-suffix matching. This is deliberately broader
// than resolveCustomerMatch's exact cascade — that already ran and found
// nothing, which is WHY the throwaway record exists — so this is a fuzzier,
// human-reviewed second pass, not another automatic match.
//
// Makes NO changes. Nothing is merged or deleted here.
//
// Usage: node scripts/findMergeCandidatesForUnnamedCustomers.js

import '../loadEnv.js';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Customer from '../models/Customer.js';
import MenuSelectionRecord from '../models/MenuSelectionRecord.js';
import matterApiService from '../services/matterApiService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const normalizePhoneDigits = (value) => String(value || '').replace(/\D/g, '');
const phoneSuffix = (value, len = 9) => normalizePhoneDigits(value).slice(-len);

// Same normalization family as customerMatchService.js, plus a looser
// "sorted token set" comparison so word-order/middle-name differences (e.g.
// "Agustin Morales" vs "Morales, Agustin R") still surface as candidates —
// resolveCustomerMatch's exact firstName/lastName match would have missed these.
const collapseWhitespace = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const tokenSet = (value) => new Set(
  collapseWhitespace(value).toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean)
);
const jaccard = (a, b) => {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
};

const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const run = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected (read-only). Re-deriving the flagged list...\n');

  const candidates = await Customer.find({
    email: { $type: 'string', $ne: '' },
    $or: [{ firstName: { $in: [null, ''] } }, { firstName: { $exists: false } }],
    $and: [{ $or: [{ lastName: { $in: [null, ''] } }, { lastName: { $exists: false } }] }]
  })
    .select('customerId email firstName lastName phone matterSubscriptionId')
    .lean();

  const flagged = candidates.filter((c) => {
    const localPart = String(c.email || '').split('@')[0].trim().toLowerCase();
    return localPart && String(c.customerId || '').trim().toLowerCase() === localPart;
  });

  // All OTHER internal customers (the pool we search for a real match in) —
  // excludes the throwaway records themselves and anyone with no name at all
  // (nothing to fuzzy-match against).
  const flaggedIds = new Set(flagged.map((c) => String(c._id)));
  const pool = await Customer.find({
    _id: { $nin: [...flaggedIds] },
    $or: [{ firstName: { $nin: [null, ''] } }, { lastName: { $nin: [null, ''] } }]
  })
    .select('customerId email firstName lastName phone dataSource matterSubscriptionId')
    .lean();

  console.log(`Flagged throwaway customers: ${flagged.length}`);
  console.log(`Candidate pool to search (named internal customers): ${pool.length}\n`);

  const rows = [];
  for (const c of flagged) {
    // Get Matter's real name/phone for this account (same lookup as the
    // prior report) — this is what we fuzzy-match against the pool, since
    // the throwaway record itself has no name to go on.
    let matterName = '';
    let matterPhone = '';
    try {
      if (c.matterSubscriptionId) {
        const detail = await matterApiService.getSubscription(c.matterSubscriptionId);
        matterName = String(detail?.data?.name || '').trim();
        matterPhone = String(detail?.data?.phone || '').trim();
      } else {
        const list = await matterApiService.listSubscriptions({ email: c.email, pageSize: 1 });
        const match = list?.data?.[0];
        if (match) {
          const detail = await matterApiService.getSubscription(match.subscription_id);
          matterName = String(detail?.data?.name || '').trim();
          matterPhone = String(detail?.data?.phone || '').trim();
        }
      }
    } catch {
      // leave blank — will just produce no candidates below
    }

    const selectionCount = await MenuSelectionRecord.countDocuments({ customer: c._id });
    const nameTokens = tokenSet(matterName || c.email.split('@')[0].replace(/[._-]/g, ' '));
    const phoneSfx = phoneSuffix(matterPhone || c.phone);

    const scored = pool.map((p) => {
      const pTokens = tokenSet([p.firstName, p.lastName].filter(Boolean).join(' '));
      const nameScore = jaccard(nameTokens, pTokens);
      const phoneMatch = phoneSfx && phoneSuffix(p.phone) === phoneSfx;
      return { p, nameScore, phoneMatch };
    }).filter((s) => s.phoneMatch || s.nameScore >= 0.5)
      .sort((a, b) => (b.phoneMatch - a.phoneMatch) || (b.nameScore - a.nameScore))
      .slice(0, 3);

    if (scored.length === 0) {
      rows.push({
        throwawayCustomerId: c.customerId,
        throwawayEmail: c.email,
        matterName,
        selectionCount,
        candidateRank: '',
        candidateCustomerId: '',
        candidateEmail: '',
        candidateName: '',
        candidateDataSource: '',
        matchReason: 'no candidate found',
        confirmed: ''
      });
      continue;
    }

    scored.forEach((s, i) => {
      rows.push({
        throwawayCustomerId: c.customerId,
        throwawayEmail: c.email,
        matterName,
        selectionCount,
        candidateRank: i + 1,
        candidateCustomerId: s.p.customerId,
        candidateEmail: s.p.email || '',
        candidateName: [s.p.firstName, s.p.lastName].filter(Boolean).join(' '),
        candidateDataSource: s.p.dataSource || '',
        matchReason: s.phoneMatch ? 'phone match' : `name similarity ${(s.nameScore * 100).toFixed(0)}%`,
        confirmed: ''
      });
    });
  }

  const outDir = path.join(__dirname, 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'merge-candidates.csv');
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(','))].join('\n');
  fs.writeFileSync(outFile, csv);

  console.log('throwawayCustomerId'.padEnd(22), 'matterName'.padEnd(22), 'candidate'.padEnd(22), 'candidateId'.padEnd(18), 'reason');
  rows.forEach((r) => {
    console.log(
      String(r.throwawayCustomerId).padEnd(22),
      String(r.matterName).padEnd(22),
      String(r.candidateName || '-').padEnd(22),
      String(r.candidateCustomerId || '-').padEnd(18),
      r.matchReason
    );
  });

  console.log(`\nFull report (with a blank "confirmed" column to fill in yes/no): ${outFile}`);
  console.log('Review this, fill "confirmed" with yes for the correct pair(s), and send it back —');
  console.log('the merge script will only act on rows you mark confirmed.');

  await mongoose.disconnect();
};

run().catch((err) => { console.error('Report failed:', err); process.exitCode = 1; mongoose.disconnect(); });
