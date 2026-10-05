import mongoose from 'mongoose';
import { config } from 'dotenv';
import process from 'node:process';

// Load env (same file the dev server uses)
config({ path: '.env.development.local' });

import Service from '../models/Service.js';

/**
 * Non-destructive seed: adds the starter catalog services ONLY if the
 * services collection is empty. Admins manage the catalog afterwards
 * from the admin dashboard.
 *
 * Usage: npm run seed:services
 */

const DEFAULT_SERVICES = [
  {
    title: 'التقارير العلمية',
    description:
      'كتابة تقارير أكاديمية وبحثية شاملة ومدققة وفقاً لأعلى المعايير التعليمية. السعر حسب عدد الأسطر.',
    price: 2000,
    service_type: 'report',
  },
  {
    title: 'السير الذاتية',
    description: 'إعداد سيرة ذاتية احترافية ومنسقة حسب التخصص المطلوب.',
    price: 10000,
    service_type: 'cv',
  },
  {
    title: 'العروض التقديمية',
    description:
      'تصميم عروض تقديمية احترافية وجذابة تساعدك على إيصال أفكارك بوضوح. السعر حسب عدد الشرائح.',
    price: 5000,
    service_type: 'presentation',
  },
];

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const count = await Service.countDocuments({});
    if (count > 0) {
      console.log(`⏭️  ${count} service(s) already exist — nothing to do.`);
    } else {
      await Service.insertMany(DEFAULT_SERVICES);
      console.log(`✅ Created ${DEFAULT_SERVICES.length} starter services`);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

run();
