import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Customer from '../models/Customer.js';
import MenuSelectionRecord from '../models/MenuSelectionRecord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

// Step 0: find Customer docs sharing the same matterSubscriptionId. The new
// unique index on that field (added in server/models/Customer.js) will fail
// to build while duplicates exist, so these must be resolved by a human
// (via the Customer Management "Internal Customer Match" panel) before the
// index rebuild step below runs.
const findSubscriptionIdCollisions = async () => {
  const docs = await Customer.find({ matterSubscriptionId: { $exists: true, $ne: null, $ne: '' } })
    .select('_id customerId matterSubscriptionId')
    .lean();

  const bySubscription = new Map();
  for (const doc of docs) {
    const key = doc.matterSubscriptionId;
    if (!bySubscription.has(key)) bySubscription.set(key, []);
    bySubscription.get(key).push(doc);
  }

  const collisions = [...bySubscription.entries()].filter(([, group]) => group.length > 1);
  if (collisions.length) {
    console.log(`  ⚠ ${collisions.length} matterSubscriptionId collision group(s) found:`);
    collisions.forEach(([subId, group]) => {
      console.log(`      ${subId} -> ${group.map((d) => d.customerId).join(', ')}`);
    });
  } else {
    console.log('  ✓ No matterSubscriptionId collisions');
  }
  return collisions;
};

// Step 1: lowercase-normalize Customer.email and MenuSelectionRecord.email.
// Collisions (two docs whose emails only differ by case, within whatever
// scope that model's unique index actually applies at — global for Customer,
// per-weeklyMenuId for MenuSelectionRecord) are logged, never written: a
// collision group is, by definition, two documents that would violate the
// live unique index the moment either one is normalized, and picking which
// one "wins" is an identity decision for a human, not a script. Only
// non-colliding docs get their casing normalized.
const normalizeEmails = async (Model, label, { scopeFields = [] } = {}) => {
  const projection = ['_id', 'email', ...scopeFields].join(' ');
  const docs = await Model.find({ email: { $exists: true, $ne: null, $ne: '' } })
    .select(projection)
    .lean();

  // scopeKey -> normalizedEmail -> [docs]. For Customer, scopeFields is empty
  // so every doc shares one scope (matches its global unique email index).
  // For MenuSelectionRecord, scopeFields is ['weeklyMenuId'] so two records
  // for different menus sharing an email are correctly NOT a collision.
  const byScope = new Map();
  for (const doc of docs) {
    const normalized = normalizeEmail(doc.email);
    if (!normalized) continue;
    const scopeKey = scopeFields.map((f) => String(doc[f] || '')).join('|');
    if (!byScope.has(scopeKey)) byScope.set(scopeKey, new Map());
    const byEmail = byScope.get(scopeKey);
    if (!byEmail.has(normalized)) byEmail.set(normalized, []);
    byEmail.get(normalized).push(doc);
  }

  const collisions = [];
  const ops = [];
  for (const byEmail of byScope.values()) {
    for (const [normalized, group] of byEmail) {
      if (group.length > 1) {
        collisions.push({ email: normalized, ids: group.map((d) => d._id.toString()) });
        continue;
      }
      const doc = group[0];
      if (doc.email !== normalized) {
        ops.push({
          updateOne: { filter: { _id: doc._id }, update: { $set: { email: normalized } } }
        });
      }
    }
  }

  if (ops.length) await Model.bulkWrite(ops);
  console.log(`  ✓ ${label}: normalized ${ops.length} of ${docs.length} email(s)`);
  if (collisions.length) {
    console.log(`  ⚠ ${label}: ${collisions.length} email collision group(s) found (left as-is, not auto-merged):`);
    collisions.forEach((c) => console.log(`      ${c.email} -> ${c.ids.join(', ')}`));
  }
  return { normalized: ops.length, total: docs.length, collisions };
};

// Step 2: backfill MenuSelectionRecord.customer from the (now-normalized)
// email, for every record that doesn't have it set yet.
//
// Two records in the SAME weeklyMenuId can resolve to the SAME Customer even
// though their stored email strings differ — e.g. a customer with a Customer
// Management email-collision left unmerged (see the Customer collision log
// above), whose two variously-cased Customer docs both regex-match one of
// this menu's records. Writing customer on both would violate the new
// {weeklyMenuId, customer} unique index (Step 1b in Customer.js's sibling
// model), so before writing, any (weeklyMenuId, customer) pair resolved by
// more than one record is treated exactly like an email collision: keep the
// first (oldest _id) record, leave the rest unset (protected by the email
// fallback index) and logged for manual review — never a silent pick.
const backfillCustomerRef = async () => {
  const records = await MenuSelectionRecord.find({ customer: { $exists: false } })
    .select('_id email weeklyMenuId')
    .lean();

  const resolved = [];
  let orphaned = 0;
  const orphanedEmails = [];

  for (const record of records) {
    const normalized = normalizeEmail(record.email);
    const customer = normalized
      ? await Customer.findOne({ email: new RegExp(`^${escapeRegex(normalized)}$`, 'i') }).select('_id').lean()
      : null;

    if (customer) {
      resolved.push({ record, customerId: customer._id });
    } else {
      orphaned += 1;
      orphanedEmails.push(record.email);
    }
  }

  const byMenuAndCustomer = new Map();
  for (const item of resolved) {
    const key = `${item.record.weeklyMenuId}|${item.customerId}`;
    if (!byMenuAndCustomer.has(key)) byMenuAndCustomer.set(key, []);
    byMenuAndCustomer.get(key).push(item);
  }

  const ops = [];
  const menuCustomerCollisions = [];
  for (const group of byMenuAndCustomer.values()) {
    if (group.length > 1) {
      menuCustomerCollisions.push({
        weeklyMenuId: group[0].record.weeklyMenuId,
        customerId: group[0].customerId,
        recordIds: group.map((g) => g.record._id.toString()),
        emails: group.map((g) => g.record.email)
      });
      // Keep the first, leave the rest orphaned (unset) for manual review.
      const [keep, ...skip] = group;
      ops.push({ updateOne: { filter: { _id: keep.record._id }, update: { $set: { customer: keep.customerId } } } });
      skip.forEach((s) => { orphaned += 1; orphanedEmails.push(s.record.email); });
      continue;
    }
    const only = group[0];
    ops.push({ updateOne: { filter: { _id: only.record._id }, update: { $set: { customer: only.customerId } } } });
  }

  if (ops.length) await MenuSelectionRecord.bulkWrite(ops, { ordered: false });
  console.log(`  ✓ Backfilled customer ref on ${ops.length} of ${records.length} record(s)`);
  if (menuCustomerCollisions.length) {
    console.log(`  ⚠ ${menuCustomerCollisions.length} (menu, customer) collision(s) found — kept the first record, left the rest unset:`);
    menuCustomerCollisions.forEach((c) => {
      console.log(`      menu ${c.weeklyMenuId} / customer ${c.customerId} -> records ${c.recordIds.join(', ')} (emails: ${c.emails.join(', ')})`);
    });
  }
  if (orphaned) {
    console.log(`  ⚠ ${orphaned} record(s) left without a matching Customer (protected by the email fallback index):`);
    orphanedEmails.slice(0, 25).forEach((e) => console.log(`      ${e}`));
    if (orphanedEmails.length > 25) console.log(`      ...and ${orphanedEmails.length - 25} more`);
  }
  return { migrated: ops.length, orphaned, menuCustomerCollisions: menuCustomerCollisions.length };
};

// Step 3: drop the old single unique index and (re)create the two partial
// indexes the schema now declares, so this script's result matches what a
// fresh `mongoose.connect` would already ensure on next server start.
const rebuildIndexes = async () => {
  const collection = mongoose.connection.db.collection('menuselectionrecords');

  try {
    await collection.dropIndex('weeklyMenuId_1_email_1');
    console.log('  ✓ Dropped old weeklyMenuId_1_email_1 index');
  } catch (error) {
    if (error.code === 27) {
      console.log('  ℹ Old weeklyMenuId_1_email_1 index does not exist (already dropped)');
    } else {
      throw error;
    }
  }

  await collection.createIndex(
    { weeklyMenuId: 1, customer: 1 },
    { unique: true, partialFilterExpression: { customer: { $type: 'objectId' } }, name: 'weeklyMenuId_1_customer_1' }
  );
  console.log('  ✓ Created weeklyMenuId_1_customer_1 partial unique index');

  await collection.createIndex(
    { weeklyMenuId: 1, email: 1 },
    { unique: true, partialFilterExpression: { customer: { $exists: false } }, name: 'weeklyMenuId_1_email_1_fallback' }
  );
  console.log('  ✓ Created weeklyMenuId_1_email_1_fallback partial unique index');
};

// Rebuilds Customer's matterSubscriptionId index as unique. Skipped (with a
// warning) if collisions remain, since a unique index can't be built over
// duplicate values — rerun the script after resolving them.
const rebuildCustomerSubscriptionIndex = async (hasCollisions) => {
  if (hasCollisions) {
    console.log('  ⚠ Skipping matterSubscriptionId unique index rebuild — resolve the collisions above first, then rerun this script.');
    return;
  }

  const collection = mongoose.connection.db.collection('customers');
  try {
    await collection.dropIndex('matterSubscriptionId_1');
    console.log('  ✓ Dropped old matterSubscriptionId_1 index');
  } catch (error) {
    if (error.code === 27) {
      console.log('  ℹ Old matterSubscriptionId_1 index does not exist (already dropped)');
    } else {
      throw error;
    }
  }

  await collection.createIndex(
    { matterSubscriptionId: 1 },
    { unique: true, sparse: true, name: 'matterSubscriptionId_1' }
  );
  console.log('  ✓ Created unique sparse matterSubscriptionId_1 index');
};

const run = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    console.log('Step 0/4: Checking matterSubscriptionId collisions...');
    const subscriptionCollisions = await findSubscriptionIdCollisions();

    console.log('\nStep 1/4: Normalizing emails...');
    const customerNorm = await normalizeEmails(Customer, 'Customer');
    const recordNorm = await normalizeEmails(MenuSelectionRecord, 'MenuSelectionRecord', { scopeFields: ['weeklyMenuId'] });

    console.log('\nStep 2/4: Backfilling MenuSelectionRecord.customer...');
    const backfill = await backfillCustomerRef();

    console.log('\nStep 3/4: Rebuilding MenuSelectionRecord indexes...');
    await rebuildIndexes();

    console.log('\nStep 4/4: Rebuilding Customer.matterSubscriptionId index...');
    await rebuildCustomerSubscriptionIndex(subscriptionCollisions.length > 0);

    console.log('\n— Summary —');
    console.log(`matterSubscriptionId collision groups: ${subscriptionCollisions.length}`);
    console.log(`Customer emails normalized: ${customerNorm.normalized}/${customerNorm.total} (${customerNorm.collisions.length} collision group(s))`);
    console.log(`MenuSelectionRecord emails normalized: ${recordNorm.normalized}/${recordNorm.total} (${recordNorm.collisions.length} collision group(s))`);
    console.log(`MenuSelectionRecord customer refs backfilled: ${backfill.migrated} (${backfill.orphaned} orphaned, ${backfill.menuCustomerCollisions} menu/customer collision(s))`);
    console.log('\n✓ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  }
};

run();
