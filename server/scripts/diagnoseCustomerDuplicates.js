// Read-only diagnostic: for a given name/email search term, prints every
// matching Customer document and every MenuSelectionRecord that references
// any of them (by customer ref OR by raw email), across every menu. Makes no
// changes. Use this to see exactly why a customer is showing up twice on
// Kitchen List — e.g. two separate Customer docs, or two MenuSelectionRecords
// for the same menu that didn't get consolidated onto one Customer ref.
//
// Usage: node scripts/diagnoseCustomerDuplicates.js "morales"
//        node scripts/diagnoseCustomerDuplicates.js "agustin@crossfitloth.com"

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

const searchTerm = process.argv[2];

const run = async () => {
  if (!searchTerm) {
    console.error('Usage: node scripts/diagnoseCustomerDuplicates.js "<name or email>"');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');

    const customers = await Customer.find({
      $or: [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { customerId: regex }
      ]
    }).lean();

    console.log(`=== ${customers.length} matching Customer document(s) ===\n`);
    customers.forEach((c) => {
      console.log(`Customer ${c.customerId}`);
      console.log(`  _id: ${c._id}`);
      console.log(`  name: "${c.firstName} ${c.lastName}"`);
      console.log(`  email: ${c.email || '(none)'}`);
      console.log(`  matterSubscriptionId: ${c.matterSubscriptionId || '(none)'}`);
      console.log(`  dataSource: ${c.dataSource || '(unset)'}`);
      console.log(`  currentWeekMenu: ${c.currentWeekMenu || '(none)'}`);
      console.log(`  selectedMeals (legacy cache): ${c.selectedMeals?.length || 0} entrie(s)`);
      console.log(`  createdAt: ${c.createdAt}`);
      console.log('');
    });

    const customerIds = customers.map((c) => String(c._id));
    const emails = customers.map((c) => String(c.email || '').toLowerCase()).filter(Boolean);

    // Also searched directly by the record's OWN denormalized firstName/
    // lastName/email — not just via the Customer docs found above. A record
    // with no valid `customer` ref and an email that matches no real
    // Customer (an orphan) would otherwise be invisible to this report even
    // though it's exactly the kind of duplicate this script exists to catch.
    const records = await MenuSelectionRecord.find({
      $or: [
        { customer: { $in: customers.map((c) => c._id) } },
        { email: { $in: emails.map((e) => new RegExp(`^${e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) } },
        { firstName: regex },
        { lastName: regex },
        { email: regex }
      ]
    }).lean();

    const menuIds = [...new Set(records.map((r) => String(r.weeklyMenuId)))];
    const menus = await WeeklyMenu.find({ _id: { $in: menuIds } }).select('title startDate endDate').lean();
    const menuById = new Map(menus.map((m) => [String(m._id), m]));

    console.log(`=== ${records.length} matching MenuSelectionRecord document(s) ===\n`);
    records.forEach((r) => {
      const menu = menuById.get(String(r.weeklyMenuId));
      console.log(`Record ${r._id}`);
      console.log(`  menu: ${menu?.title || '(unknown)'} (${r.weeklyMenuId})`);
      console.log(`  email: ${r.email}`);
      console.log(`  customer ref: ${r.customer || '(NOT SET)'}`);
      console.log(`  customerId (denormalized): ${r.customerId || '(none)'}`);
      console.log(`  submittedAt: ${r.submittedAt}`);
      console.log(`  selectedMeals: ${r.selectedMeals?.length || 0} total, ${r.selectedMeals?.filter((m) => m.isAutoAssigned).length || 0} auto-assigned`);
      (r.selectedMeals || []).forEach((m) => {
        const dateStr = m.date instanceof Date ? m.date.toISOString().slice(0, 10) : String(m.date);
        console.log(`      ${dateStr} | ${m.mealType} | ${m.mealName} | auto=${!!m.isAutoAssigned}`);
      });
      console.log('');
    });

    // Flag the specific patterns that cause "shows up twice" on Kitchen List:
    // (a) more than one Customer doc for what's presumably the same person,
    // (b) more than one MenuSelectionRecord for the SAME menu among the
    //     matched records (whether or not they point at the same customer).
    console.log('=== Flags ===');
    if (customers.length > 1) {
      console.log(`⚠ ${customers.length} separate Customer documents matched this search — likely duplicate identities.`);
    }
    const byMenu = new Map();
    records.forEach((r) => {
      const key = String(r.weeklyMenuId);
      if (!byMenu.has(key)) byMenu.set(key, []);
      byMenu.get(key).push(r);
    });
    for (const [menuId, group] of byMenu) {
      if (group.length > 1) {
        const menu = menuById.get(menuId);
        console.log(`⚠ Menu "${menu?.title || menuId}" has ${group.length} MenuSelectionRecord documents matching this search:`);
        group.forEach((r) => {
          console.log(`    ${r._id} | email: ${r.email} | customer ref: ${r.customer || '(NOT SET)'}`);
        });
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('✗ Diagnostic failed:', error);
    process.exit(1);
  }
};

run();
