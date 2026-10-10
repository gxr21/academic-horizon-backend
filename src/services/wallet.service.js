import User from '../models/User.js';
import Order from '../models/Order.js';
import PlatformSettings from '../models/PlatformSettings.js';
import WalletTransaction from '../models/WalletTransaction.js';
import Withdrawal from '../models/Withdrawal.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors.js';
import { ORDER_STATUS, ROLES } from '../utils/constants.js';
import {
  MIN_WITHDRAWAL_IQD,
  isMastercardNumber,
  isValidExpiry,
  maskCard,
  normalizeCardNumber,
  normalizeIraqiWalletNumber,
  WITHDRAWAL_METHODS,
} from '../utils/mastercard.js';
import { encryptCard, decryptCard } from '../utils/cardCrypto.js';
import { notifyUsers, notifyRole } from './notification.service.js';

const DEFAULT_COMMISSION = Math.min(
  100,
  Math.max(0, Number(process.env.PLATFORM_COMMISSION_PERCENT) || 15)
);

export const splitAmount = (price, percent) => {
  const safePrice = Math.max(0, Math.round(Number(price) || 0));
  const rate = Math.min(100, Math.max(0, Number(percent) || 0));
  const commission = Math.round((safePrice * rate) / 100);
  return {
    rate,
    commissionAmount: commission,
    providerAmount: safePrice - commission,
  };
};

export const getPlatformSettings = async () => {
  let settings = await PlatformSettings.findOne({ key: 'default' });
  if (!settings) {
    settings = await PlatformSettings.create({
      key: 'default',
      commission_percent: DEFAULT_COMMISSION,
      wallet_balance: 0,
    });
  }
  return settings;
};

export const updateCommissionPercent = async (percent) => {
  const rate = Number(percent);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new ValidationError('نسبة العمولة يجب أن تكون بين 0 و 100');
  }
  const settings = await PlatformSettings.findOneAndUpdate(
    { key: 'default' },
    { $set: { commission_percent: rate } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return settings.toJSON();
};

export const snapshotForPrice = async (price) => {
  const settings = await getPlatformSettings();
  return splitAmount(price, settings.commission_percent);
};

/**
 * Credit provider + platform wallets once when an order is delivered.
 * Safe to call more than once — only the first claim wins.
 */
export const settleDeliveredOrder = async (order) => {
  if (!order || order.status !== ORDER_STATUS.DELIVERED) return null;
  if (order.settled) return order.toJSON ? order.toJSON() : order;

  const settings = await getPlatformSettings();
  const snapshot = splitAmount(order.price, order.commission_rate ?? settings.commission_percent);

  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, settled: { $ne: true } },
    {
      $set: {
        settled: true,
        settled_at: new Date(),
        commission_rate: snapshot.rate,
        commission_amount: snapshot.commissionAmount,
        provider_amount: snapshot.providerAmount,
      },
    },
    { new: true }
  );

  if (!claimed) return order.toJSON ? order.toJSON() : order;

  if (claimed.price > 0 && claimed.provider_id) {
    const [provider, platform] = await Promise.all([
      User.findByIdAndUpdate(
        claimed.provider_id,
        { $inc: { wallet_balance: snapshot.providerAmount } },
        { new: true }
      ),
      PlatformSettings.findOneAndUpdate(
        { key: 'default' },
        { $inc: { wallet_balance: snapshot.commissionAmount } },
        { new: true, upsert: true }
      ),
    ]);

    await WalletTransaction.create([
      {
        user_id: claimed.provider_id,
        type: 'order_credit',
        direction: 'credit',
        amount: snapshot.providerAmount,
        order_id: claimed._id,
        balance_after: provider?.wallet_balance ?? snapshot.providerAmount,
        note: `أرباح الطلب بعد خصم عمولة ${snapshot.rate}%`,
      },
      {
        user_id: null,
        type: 'commission',
        direction: 'credit',
        amount: snapshot.commissionAmount,
        order_id: claimed._id,
        balance_after: platform?.wallet_balance ?? snapshot.commissionAmount,
        note: `عمولة المنصة ${snapshot.rate}% من الطلب`,
      },
    ]);
  }

  return claimed.toJSON();
};

export const getProviderWallet = async (providerId) => {
  const provider = await User.findById(providerId);
  if (!provider || provider.role !== ROLES.PROVIDER) {
    throw new ForbiddenError('المحفظة متاحة لمزود الخدمة فقط');
  }

  const [settings, transactions, withdrawals, pendingHold] = await Promise.all([
    getPlatformSettings(),
    WalletTransaction.find({ user_id: providerId }).sort({ created_at: -1 }).limit(50),
    Withdrawal.find({ provider_id: providerId }).sort({ created_at: -1 }).limit(20),
    Withdrawal.aggregate([
      { $match: { provider_id: provider._id, status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  return {
    balance: provider.wallet_balance || 0,
    pendingWithdrawal: pendingHold[0]?.total || 0,
    commissionPercent: settings.commission_percent,
    minWithdrawal: MIN_WITHDRAWAL_IQD,
    method: 'mastercard',
    methods: Object.entries(WITHDRAWAL_METHODS).map(([id, label]) => ({ id, label })),
    transactions: transactions.map((row) => row.toJSON()),
    withdrawals: withdrawals.map((row) => row.toJSON()),
  };
};

export const getAdminFinance = async () => {
  const [settings, pendingCount, withdrawals, providers] = await Promise.all([
    getPlatformSettings(),
    Withdrawal.countDocuments({ status: 'pending' }),
    Withdrawal.find({})
      .populate('provider_id', 'name email phone')
      .sort({ created_at: -1 })
      .limit(100),
    User.find({ role: ROLES.PROVIDER }).select('name email wallet_balance').sort({ wallet_balance: -1 }).limit(50),
  ]);

  return {
    platformBalance: settings.wallet_balance || 0,
    commissionPercent: settings.commission_percent,
    pendingWithdrawals: pendingCount,
    minWithdrawal: MIN_WITHDRAWAL_IQD,
    withdrawals: withdrawals.map((row) => row.toJSON()),
    providerBalances: providers.map((user) => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      walletBalance: user.wallet_balance || 0,
    })),
  };
};

/** Short description of where the money goes, for notifications and notes. */
const describeDestination = (withdrawal) =>
  withdrawal.method === 'mastercard'
    ? `ماستركارد ****${withdrawal.card_last4}`
    : `${WITHDRAWAL_METHODS[withdrawal.method] || withdrawal.method} (${withdrawal.wallet_number})`;

export const requestWithdrawal = async (providerId, data) => {
  const method = data.method || 'mastercard';
  if (!WITHDRAWAL_METHODS[method]) {
    throw new ValidationError('طريقة السحب غير مدعومة');
  }

  const amount = Math.round(Number(data.amount));
  if (!Number.isFinite(amount) || amount < MIN_WITHDRAWAL_IQD) {
    throw new ValidationError(`أقل مبلغ للسحب هو ${MIN_WITHDRAWAL_IQD} دينار`);
  }

  const holder = String(data.cardHolderName || '').trim();
  if (holder.length < 3) {
    throw new ValidationError(
      method === 'mastercard' ? 'اكتب الاسم كما هو على بطاقة ماستركارد' : 'اكتب اسم صاحب المحفظة'
    );
  }

  let cardNumber = '';
  let expiry = '';
  let walletNumber = '';

  if (method === 'mastercard') {
    cardNumber = normalizeCardNumber(data.cardNumber);
    if (!isMastercardNumber(cardNumber)) {
      throw new ValidationError('رقم البطاقة يجب أن يكون ماستركارد صالحاً');
    }
    expiry = String(data.cardExpiry || '').trim();
    if (expiry && !isValidExpiry(expiry)) {
      throw new ValidationError('تاريخ الانتهاء بصيغة MM/YY');
    }
  } else {
    walletNumber = normalizeIraqiWalletNumber(data.walletNumber);
    if (!walletNumber) {
      throw new ValidationError('اكتب رقم المحفظة بصيغة 07xxxxxxxxx');
    }
  }

  const provider = await User.findOneAndUpdate(
    { _id: providerId, role: ROLES.PROVIDER, wallet_balance: { $gte: amount } },
    { $inc: { wallet_balance: -amount } },
    { new: true }
  );

  if (!provider) {
    throw new ValidationError('رصيد المحفظة لا يكفي لطلب السحب');
  }

  const withdrawal = await Withdrawal.create({
    provider_id: providerId,
    amount,
    status: 'pending',
    method,
    card_holder_name: holder,
    card_last4: method === 'mastercard' ? maskCard(cardNumber) : '',
    card_expiry: expiry,
    card_encrypted: method === 'mastercard' ? encryptCard(cardNumber) : '',
    wallet_number: walletNumber,
  });

  await WalletTransaction.create({
    user_id: providerId,
    type: 'withdrawal_hold',
    direction: 'debit',
    amount,
    withdrawal_id: withdrawal._id,
    balance_after: provider.wallet_balance,
    note: `تم حجز المبلغ بانتظار تحويله من الإدارة إلى ${WITHDRAWAL_METHODS[method]}`,
  });

  await notifyRole(ROLES.ADMIN, {
    type: 'withdrawal_requested',
    title: `طلب سحب ${WITHDRAWAL_METHODS[method]}`,
    message: `${provider.name} طلب سحب ${amount} دينار إلى ${describeDestination(withdrawal)}.`,
  });

  return withdrawal.toJSON();
};

export const reviewWithdrawal = async ({ withdrawalId, adminId, status, adminNote = '' }) => {
  if (!['paid', 'rejected'].includes(status)) {
    throw new ValidationError('الحالة يجب أن تكون paid أو rejected');
  }

  const withdrawal = await Withdrawal.findById(withdrawalId);
  if (!withdrawal) throw new NotFoundError('Withdrawal');
  if (withdrawal.status !== 'pending') {
    throw new ValidationError('هذا الطلب تمت معالجته مسبقاً');
  }

  withdrawal.status = status;
  withdrawal.admin_note = adminNote;
  withdrawal.reviewed_by = adminId;
  withdrawal.reviewed_at = new Date();
  if (status === 'paid') {
    withdrawal.card_encrypted = '';
  }
  await withdrawal.save();

  if (status === 'rejected') {
    const provider = await User.findByIdAndUpdate(
      withdrawal.provider_id,
      { $inc: { wallet_balance: withdrawal.amount } },
      { new: true }
    );
    await WalletTransaction.create({
      user_id: withdrawal.provider_id,
      type: 'withdrawal_refund',
      direction: 'credit',
      amount: withdrawal.amount,
      withdrawal_id: withdrawal._id,
      balance_after: provider?.wallet_balance ?? 0,
      note: adminNote || 'أُعيد المبلغ إلى المحفظة بعد رفض السحب',
    });
  } else {
    const provider = await User.findById(withdrawal.provider_id);
    await WalletTransaction.create({
      user_id: withdrawal.provider_id,
      type: 'withdrawal_paid',
      direction: 'debit',
      amount: 0,
      withdrawal_id: withdrawal._id,
      balance_after: provider?.wallet_balance ?? 0,
      note: `تم تحويل المبلغ إلى ${WITHDRAWAL_METHODS[withdrawal.method] || 'حساب المزود'}`,
    });
  }

  await notifyUsers([withdrawal.provider_id], {
    type: status === 'paid' ? 'withdrawal_paid' : 'withdrawal_rejected',
    title: status === 'paid' ? 'تم تحويل السحب' : 'رُفض طلب السحب',
    message:
      status === 'paid'
        ? `حُوّل ${withdrawal.amount} دينار إلى ${describeDestination(withdrawal)}.`
        : `رُفض سحب ${withdrawal.amount} دينار وأُعيد إلى محفظتك.${adminNote ? ` السبب: ${adminNote}` : ''}`,
  });

  return withdrawal.toJSON();
};

export const revealWithdrawalCard = async (withdrawalId) => {
  const withdrawal = await Withdrawal.findById(withdrawalId).select('+card_encrypted');
  if (!withdrawal) throw new NotFoundError('Withdrawal');
  if (withdrawal.status !== 'pending') {
    throw new ForbiddenError('رقم البطاقة يُعرض فقط لطلبات السحب المعلقة');
  }
  const method = withdrawal.method || 'mastercard';
  const cardNumber = method === 'mastercard' ? decryptCard(withdrawal.card_encrypted) : '';
  return {
    id: withdrawal._id.toString(),
    method,
    walletNumber: withdrawal.wallet_number || '',
    cardHolderName: withdrawal.card_holder_name,
    cardNumber,
    cardLast4: withdrawal.card_last4,
    cardExpiry: withdrawal.card_expiry,
    amount: withdrawal.amount,
  };
};
