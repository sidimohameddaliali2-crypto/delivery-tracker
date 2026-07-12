import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const fixIndexes = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('customers');

    console.log('\nDropping old email index...');
    try {
      await collection.dropIndex('email_1');
      console.log('✓ Dropped old email_1 index');
    } catch (error) {
      if (error.code === 27) {
        console.log('ℹ Index email_1 does not exist (already dropped)');
      } else {
        throw error;
      }
    }

    console.log('\nCreating new sparse unique email index...');
    await collection.createIndex(
      { email: 1 },
      { unique: true, sparse: true, name: 'email_1' }
    );
    console.log('✓ Created sparse unique email index');

    console.log('\nEnsuring customerId index...');
    await collection.createIndex(
      { customerId: 1 },
      { unique: true, name: 'customerId_1' }
    );
    console.log('✓ Created unique customerId index');

    console.log('\nListing all indexes:');
    const indexes = await collection.indexes();
    indexes.forEach(index => {
      console.log(`  - ${index.name}:`, JSON.stringify(index.key), 
        index.unique ? '(unique)' : '', 
        index.sparse ? '(sparse)' : '');
    });

    console.log('\n✓ Index migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('✗ Error fixing indexes:', error);
    process.exit(1);
  }
};

fixIndexes();
