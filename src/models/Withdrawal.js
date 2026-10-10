import mongoose from 'mongoose';

/**
 * Provider Mastercard payout request. Full PAN is encrypted at rest
 * and wiped after the admin marks the transfer as paid.
 */
const withdrawalSchema = new mongoose.Schema(
  {
    provider_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'rejected'],
      default: 'pending',
    },
    method: {
      type: String,
      enum: ['mastercard', 'zaincash', 'asiahawala'],
      default: 'mastercard',
    },
    // Phone number of the Zain Cash / Asia Hawala wallet (wallet payouts only)
    wallet_number: {
      type: String,
      trim: true,
      maxlength: 20,
      default: '',
    },
    card_holder_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    card_last4: {
      type: String,
      // Only Mastercard payouts have a card; wallet payouts leave this empty
      required() {
        return this.method === 'mastercard';
      },
      match: /^(\d{4})?$/,
      default: '',
    },
    card_expiry: {
      type: String,
      trim: true,
      maxlength: 7,
      default: '',
    },
    card_encrypted: {
      type: String,
      default: '',
      select: false,
    },
    admin_note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    reviewed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewed_at: {
      type: Date,
      default: null,
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
        const toId = (v) => (v ? (v._id ? v._id : v).toString() : null);
        ret.providerId = toId(doc.provider_id);
        ret.method = doc.method || 'mastercard';
        ret.walletNumber = doc.wallet_number || '';
        ret.cardHolderName = doc.card_holder_name;
        ret.cardLast4 = doc.card_last4;
        ret.cardExpiry = doc.card_expiry || '';
        ret.adminNote = doc.admin_note || '';
        ret.reviewedBy = toId(doc.reviewed_by);
        ret.reviewedAt = doc.reviewed_at;
        ret.createdAt = doc.created_at;
        ret.updatedAt = doc.updated_at;
        if (doc.provider_id && typeof doc.provider_id === 'object' && doc.provider_id.toJSON) {
          ret.provider = doc.provider_id.toJSON();
        }
        delete ret._id;
        delete ret.__v;
        delete ret.provider_id;
        delete ret.wallet_number;
        delete ret.card_holder_name;
        delete ret.card_last4;
        delete ret.card_expiry;
        delete ret.card_encrypted;
        delete ret.admin_note;
        delete ret.reviewed_by;
        delete ret.reviewed_at;
        delete ret.created_at;
        delete ret.updated_at;
        return ret;
      },
    },
  }
);

withdrawalSchema.index({ status: 1, created_at: -1 });

const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);
export default Withdrawal;
