import mongoose from 'mongoose';

const TRANSACTION_TYPES = [
  'order_credit',
  'commission',
  'withdrawal_hold',
  'withdrawal_paid',
  'withdrawal_refund',
];

const walletTransactionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: TRANSACTION_TYPES,
      required: true,
    },
    direction: {
      type: String,
      enum: ['credit', 'debit'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    withdrawal_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Withdrawal',
      default: null,
    },
    balance_after: {
      type: Number,
      default: 0,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: false,
    },
    toJSON: {
      transform(doc, ret) {
        ret.id = doc._id.toString();
        ret.userId = doc.user_id ? doc.user_id.toString() : null;
        ret.orderId = doc.order_id ? doc.order_id.toString() : null;
        ret.withdrawalId = doc.withdrawal_id ? doc.withdrawal_id.toString() : null;
        ret.balanceAfter = doc.balance_after;
        ret.createdAt = doc.created_at;
        delete ret._id;
        delete ret.__v;
        delete ret.user_id;
        delete ret.order_id;
        delete ret.withdrawal_id;
        delete ret.balance_after;
        delete ret.created_at;
        return ret;
      },
    },
  }
);

walletTransactionSchema.index({ user_id: 1, created_at: -1 });

const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);
export default WalletTransaction;
