import mongoose from 'mongoose';
import Customer from '../models/Customer.js';

const migrate = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/matter-delivery');
    console.log('Connected to DB');

    // Set weekend=false where field is missing or null
    const res = await Customer.updateMany(
      { $or: [ { weekend: { $exists: false } }, { weekend: null } ] },
      { $set: { weekend: false } }
    );

    console.log('Migration complete. Matched:', res.matchedCount, 'Modified:', res.modifiedCount);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
};

migrate();
