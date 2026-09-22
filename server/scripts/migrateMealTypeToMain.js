import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Merges the old 'lunch'/'dinner' mealType values into a single 'main' value
// across every collection that stores mealType (top-level or nested in an
// array). Run with --dry-run first to see counts without writing anything.

const DRY_RUN = process.argv.includes('--dry-run');

const TOP_LEVEL_TARGETS = [
  { collection: 'menuitems', field: 'mealType' },
  { collection: 'partnermenuitems', field: 'mealType' }
];

const NESTED_ARRAY_TARGETS = [
  { collection: 'weeklymenus', arrayPath: 'meals', field: 'mealType' },
  { collection: 'customers', arrayPath: 'selectedMeals', field: 'mealType' },
  { collection: 'menuselectionrecords', arrayPath: 'selectedMeals', field: 'mealType' }
];

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected. ${DRY_RUN ? '[DRY RUN — no writes]' : '[LIVE — will write]'}\n`);

  const db = mongoose.connection.db;

  for (const { collection, field } of TOP_LEVEL_TARGETS) {
    const coll = db.collection(collection);
    const filter = { [field]: { $in: ['lunch', 'dinner'] } };
    const count = await coll.countDocuments(filter);
    console.log(`${collection}.${field}: ${count} document(s) with lunch/dinner`);
    if (!DRY_RUN && count > 0) {
      const result = await coll.updateMany(filter, { $set: { [field]: 'main' } });
      console.log(`  -> updated ${result.modifiedCount}`);
    }
  }

  for (const { collection, arrayPath, field } of NESTED_ARRAY_TARGETS) {
    const coll = db.collection(collection);
    const arrFieldPath = `${arrayPath}.${field}`;
    const filter = { [arrFieldPath]: { $in: ['lunch', 'dinner'] } };
    const count = await coll.countDocuments(filter);
    console.log(`${collection}.${arrFieldPath}: ${count} document(s) with lunch/dinner`);
    if (!DRY_RUN && count > 0) {
      const result = await coll.updateMany(
        filter,
        { $set: { [`${arrayPath}.$[elem].${field}`]: 'main' } },
        { arrayFilters: [{ [`elem.${field}`]: { $in: ['lunch', 'dinner'] } }] }
      );
      console.log(`  -> updated ${result.modifiedCount}`);
    }
  }

  await mongoose.disconnect();
  console.log('\nDone.');
};

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
