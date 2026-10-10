import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Order from './Order.js';
import Message from './Message.js';
import Notification from './Notification.js';

/**
 * User Schema
 * Roles: student, provider, admin
 * Features: E2EE public key, subscription management
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [3, 'Name must be at least 3 characters'],
      maxlength: [50, 'Name must be at most 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      // Accounts created through Google sign-in have no password until they set one
      required: [
        function () {
          return !this.google_id;
        },
        'Password is required',
      ],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // Never return password by default
    },
    // Google account id ("sub"); proves the email belongs to this person
    google_id: {
      type: String,
      unique: true,
      sparse: true,
      select: false,
    },
    email_verified: {
      type: Boolean,
      default: false,
    },
    email_verified_at: {
      type: Date,
      default: null,
    },
    // True only for accounts that signed up with the form: they cannot log in until the
    // emailed link is opened. Older accounts do not have this flag, so they keep working.
    email_verification_required: {
      type: Boolean,
      default: false,
    },
    email_verification_token: {
      type: String,
      select: false,
      default: null,
    },
    email_verification_expires: {
      type: Date,
      select: false,
      default: null,
    },
    email_verification_sent_at: {
      type: Date,
      select: false,
      default: null,
    },
    // Providers who sign up themselves wait here until an admin decides.
    // Every other account (and all older ones) is simply "approved".
    approval_status: {
      type: String,
      enum: ['approved', 'pending', 'rejected'],
      default: 'approved',
    },
    approval_note: {
      type: String,
      trim: true,
      maxlength: [500, 'Approval note must be at most 500 characters'],
      default: '',
    },
    approval_decided_at: {
      type: Date,
      default: null,
    },
    role: {
      type: String,
      enum: {
        values: ['student', 'provider', 'admin'],
        message: 'Role must be student, provider, or admin',
      },
      default: 'student',
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    // Admin restriction: none | temporary (until restriction_until) | permanent
    restriction_type: {
      type: String,
      enum: ['none', 'temporary', 'permanent'],
      default: 'none',
    },
    restriction_until: {
      type: Date,
      default: null,
    },
    restriction_reason: {
      type: String,
      trim: true,
      maxlength: [500, 'Restriction reason must be at most 500 characters'],
      default: '',
    },
    restricted_at: {
      type: Date,
      default: null,
    },
    restricted_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    subscription_type: {
      type: String,
      enum: {
        values: ['free', 'basic', 'pro'],
        message: 'Subscription type must be free, basic, or pro',
      },
      default: 'free',
    },
    subscription_expires_at: {
      type: Date,
      default: null,
    },
    public_key: {
      type: String,
      default: null,
    },
    avatar_url: {
      type: String,
      default: null,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [30, 'Phone must be at most 30 characters'],
      default: '',
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [1000, 'Bio must be at most 1000 characters'],
      default: '',
    },
    gender: {
      type: String,
      enum: {
        values: ['male', 'female', 'unspecified'],
        message: 'Gender must be male, female, or unspecified',
      },
      default: 'unspecified',
    },
    wallet_balance: {
      type: Number,
      min: 0,
      default: 0,
    },
    password_reset_token: {
      type: String,
      select: false,
      default: null,
    },
    password_reset_expires: {
      type: Date,
      select: false,
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
        ret.id = ret._id.toString();
        ret.restrictionType = doc.restriction_type || 'none';
        ret.restrictionUntil = doc.restriction_until || null;
        ret.restrictionReason = doc.restriction_reason || '';
        ret.restrictedAt = doc.restricted_at || null;
        ret.phone = doc.phone || '';
        ret.bio = doc.bio || '';
        ret.gender = doc.gender || 'unspecified';
        ret.walletBalance = doc.wallet_balance || 0;
        ret.createdAt = doc.created_at;
        ret.emailVerified = !!doc.email_verified;
        ret.emailVerifiedAt = doc.email_verified_at || null;
        delete ret.email_verified;
        delete ret.email_verified_at;
        ret.approvalStatus = doc.approval_status || 'approved';
        ret.approvalNote = doc.approval_note || '';
        delete ret.approval_status;
        delete ret.approval_note;
        delete ret.approval_decided_at;
        delete ret.google_id;
        delete ret.email_verification_required;
        delete ret.email_verification_token;
        delete ret.email_verification_expires;
        delete ret.email_verification_sent_at;
        delete ret.wallet_balance;
        delete ret._id;
        delete ret.__v;
        delete ret.password; // Always exclude password
        delete ret.restriction_type;
        delete ret.restriction_until;
        delete ret.restriction_reason;
        delete ret.restricted_at;
        delete ret.restricted_by;
        return ret;
      },
    },
  }
);

/**
 * Hash password before saving (only on create/update if modified)
 */
userSchema.pre('save', async function () {
  // Only hash if password is modified
  if (!this.isModified('password')) return;

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

/**
 * Cascade delete: when a user is deleted, remove their orders and messages.
 * Handles findOneAndDelete / findByIdAndDelete.
 */
userSchema.pre('findOneAndDelete', async function () {
  const user = await this.model.findOne(this.getFilter());
  if (user) {
    // Delete all orders where user is student OR provider
    await Promise.all([
      Order.deleteMany({ student_id: user._id }),
      Order.deleteMany({ provider_id: user._id }),
    ]);
    // Delete all messages sent by this user
    await Message.deleteMany({ sender_id: user._id });
    // Delete this user's notifications
    await Notification.deleteMany({ user_id: user._id });
    const Report = (await import('./Report.js')).default;
    const ProfileChangeRequest = (await import('./ProfileChangeRequest.js')).default;
    await Report.deleteMany({ $or: [{ reporter_id: user._id }, { reported_id: user._id }] });
    const changeRequests = await ProfileChangeRequest.find({ provider_id: user._id });
    await Promise.all(
      changeRequests.flatMap((reqDoc) =>
        (reqDoc.documents || []).map((doc) =>
          import('node:fs/promises')
            .then((fs) => fs.unlink(doc.file_path).catch(() => {}))
        )
      )
    );
    await ProfileChangeRequest.deleteMany({ provider_id: user._id });
    const Withdrawal = (await import('./Withdrawal.js')).default;
    const WalletTransaction = (await import('./WalletTransaction.js')).default;
    await Promise.all([
      Withdrawal.deleteMany({ provider_id: user._id }),
      WalletTransaction.deleteMany({ user_id: user._id }),
    ]);
  }
});

/**
 * Compare password method
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  // Google-only accounts have no stored password to compare with
  if (!this.password || !candidatePassword) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);
export default User;
