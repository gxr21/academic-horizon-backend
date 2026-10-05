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
        delete ret._id;
        delete ret.__v;
        delete ret.commission_percent;
        delete ret.wallet_balance;
        return ret;
      },
    },
  }
);

const PlatformSettings = mongoose.model('PlatformSettings', platformSettingsSchema);
export default PlatformSettings;
