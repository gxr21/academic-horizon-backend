import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import process from 'node:process';

// Load env
config({ path: '.env.development.local' });

import User from '../models/User.js';
import Order from '../models/Order.js';
import Message from '../models/Message.js';

const seed = async () => {
  try {
    console.log('🌱 Starting seed...');
    console.log(`📡 Connecting to: ${process.env.MONGODB_URI}`);

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    await Promise.all([
      User.deleteMany({}),
      Order.deleteMany({}),
      Message.deleteMany({}),
    ]);
    console.log('🗑️  Cleared existing data');

    // Create Admin
    const admin = await User.create({
      name: 'مدير النظام',
      email: 'admin@academic.com',
      password: 'admin123',
      role: 'admin',
    });
    console.log(`✅ Admin created: ${admin.email}`);

    // Create Provider
    const provider = await User.create({
      name: 'مزود الخدمة',
      email: 'provider@academic.com',
      password: 'provider123',
      role: 'provider',
    });
    console.log(`✅ Provider created: ${provider.email}`);

    // Create Student
    const student = await User.create({
      name: 'طالب تجريبي',
      email: 'student@test.com',
      password: 'student123',
      role: 'student',
    });
    console.log(`✅ Student created: ${student.email}`);

    // Create Sample Orders
    const order1 = await Order.create({
      title: 'بحث تخرج في علوم الحاسوب',
      description: 'بحث تخرج حول الذكاء الاصطناعي وتطبيقاته في التعليم',
      service_type: 'graduation_research',
      price: 150,
      status: 'assigned',
      student_id: student._id,
      provider_id: provider._id,
    });

    const order2 = await Order.create({
      title: 'تصميم عرض تقديمي',
      description: 'عرض تقديمي احترافي لمشروع التخرج',
      service_type: 'presentation',
      price: 50,
      status: 'pending',
      student_id: student._id,
    });

    const order3 = await Order.create({
      title: 'مراجعة ورقة بحثية',
      description: 'مراجعة لغوية وعلمية لورقة بحثية في مجال هندسة البرمجيات',
      service_type: 'paper_review',
      price: 75,
      status: 'in_progress',
      student_id: student._id,
      provider_id: provider._id,
    });

    console.log(`✅ Created ${3} sample orders`);

    // Create sample encrypted messages (simulated E2EE data)
    await Message.create([
      {
        order_id: order1._id,
        sender_id: student._id,
        encrypted_message: 'U2FsdGVkX1+example_encrypted_student_msg_1==',
        iv: 'abc123iv1',
        message_type: 'text',
      },
      {
        order_id: order1._id,
        sender_id: provider._id,
        encrypted_message: 'U2FsdGVkX1+example_encrypted_provider_reply_1==',
        iv: 'abc123iv2',
        message_type: 'text',
      },
      {
        order_id: order1._id,
        sender_id: student._id,
        encrypted_message: 'U2FsdGVkX1+example_encrypted_student_msg_2==',
        iv: 'abc123iv3',
        message_type: 'text',
      },
    ]);
    console.log('✅ Created sample encrypted messages');

    // Summary
    console.log('\n📋 Seed Summary:');
    console.log('═══════════════════════════════════════');
    console.log('Users:');
    console.log(`  Admin:    admin@academic.com / admin123`);
    console.log(`  Provider: provider@academic.com / provider123`);
    console.log(`  Student:  student@test.com / student123`);
    console.log('Orders:');
    console.log(`  1. "${order1.title}" — ${order1.status}`);
    console.log(`  2. "${order2.title}" — ${order2.status}`);
    console.log(`  3. "${order3.title}" — ${order3.status}`);
    console.log('═══════════════════════════════════════');
    console.log('🎉 Seed complete!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
};

seed();
