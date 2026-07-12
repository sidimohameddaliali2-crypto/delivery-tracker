import mongoose from 'mongoose';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';

const createSuperAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/matter-delivery');
    
    const superAdmin = new User({
      email: 'superadmin@matter.com',
      password: 'admin123', // Change this to a secure password
      role: 'super_admin',
      profile: {
        firstName: 'Super',
        lastName: 'Admin',
        phone: '+1234567890'
      },
      isActive: true
    });

    await superAdmin.save();
    console.log('Super admin created successfully:', superAdmin.email);
    process.exit(0);
  } catch (error) {
    console.error('Error creating super admin:', error);
    process.exit(1);
  }
};

createSuperAdmin();