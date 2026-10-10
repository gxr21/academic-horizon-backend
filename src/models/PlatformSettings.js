import mongoose from 'mongoose';

/**
 * Singleton platform ledger: commission rate + admin wallet.
 */
const platformSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      default: 'default',
    },
    commission_percent: {
      type: Number,
      min: 0,
      max: 100,
      default: 15,
    },
    wallet_balance: {
      type: Number,
      min: 0,
      default: 0,
    },
    // Where students send their transfers (set by the admin from the dashboard)
    payment_methods: {
      type: [
        new mongoose.Schema(
          {
            id: { type: String, trim: true, maxlength: 40 },
            label: { type: String, trim: true, maxlength: 60 },
            account: { type: String, trim: true, maxlength: 120 },
            holder: { type: String, trim: true, maxlength: 80, default: '' },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    payment_instructions: {
      type: String,
      trim: true,
      maxlength: 600,
      default: '',
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    toJSON: {
      transform(doc, ret) {
        ret.id = doc._id.toString();
        ret.commissionPercent = doc.commission_percent;
        ret.walletBalance = doc.wallet_balance;
        ret.paymentMethods = doc.payment_methods || [];
        ret.paymentInstructions = doc.payment_instructions || '';
        delete ret._id;
        delete ret.__v;
        delete ret.commission_percent;
        delete ret.wallet_balance;
        delete ret.payment_methods;
        delete ret.payment_instructions;
        return ret;
      },
    },
  }
);

const PlatformSettings = mongoose.model('PlatformSettings', platformSettingsSchema);
export default PlatformSettings;
