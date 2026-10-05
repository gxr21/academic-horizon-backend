import mongoose from 'mongoose';
import { config } from 'dotenv';
import process from 'node:process';

// Load env (same file the dev server uses)
config({ path: '.env.development.local' });

import User from '../models/User.js';

/**
 * Non-destructive seed: adds 4 provider accounts (and an admin account if
 * none exists). Existing users are NOT deleted or modified.
 *
 * Usage: npm run seed:providers
 * DEVELOPMENT ONLY — these accounts use well-known passwords.
 */

const PROVIDERS = [
  { name: 'مزود الخدمة 1', email: 'provider1@academic.com', password: 'Provider@123' },
  { name: 'مزود الخدمة 2', email: 'provider2@academic.com', password: 'Provider@123' },
  { name: 'مزود الخدمة 3', email: 'provider3@academic.com', password: 'Provider@123' },
  { name: 'مزود الخدمة 4', email: 'provider4@academic.com', password: 'Provider@123' },
];

const ADMIN = { name: 'مدير النظام', email: 'admin@academic.com', password: 'Admin@12345' };

const run = async () => {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Refusing to run in production.');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    for (const p of PROVIDERS) {
      const exists = await User.findOne({ email: p.email });
      if (exists) {
        console.log(`⏭️  Provider exists, skipped: ${p.email}`);
        continue;
      }
      await User.create({ ...p, role: 'provider' });
      console.log(`✅ Provider created: ${p.email}`);
    }

    // Create an admin only if the database has none
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount === 0) {
      await User.create({ ...ADMIN, role: 'admin' });
      console.log(`✅ Admin created: ${ADMIN.email}`);
    } else {
      console.log(`⏭️  Admin already exists (${adminCount}), skipped`);
    }

    console.log('\n📋 Accounts:');
    console.log('═══════════════════════════════════════');
    for (const p of PROVIDERS) console.log(`  Provider: ${p.email} / ${p.password}`);
    console.log(`  Admin:    ${ADMIN.email} / ${ADMIN.password}  (only if it was created now)`);
    console.log('═══════════════════════════════════════\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

run();
