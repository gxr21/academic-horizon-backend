import mongoose from 'mongoose';
import { ORDER_STATUS } from '../utils/constants.js';
import Message from './Message.js';
import Notification from './Notification.js';

/**
 * Order Schema
 * Represents a service request/order from a student to a provider
 */
const orderSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Order title is required'],
      trim: true,
      maxlength: [200, 'Title must be at most 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description must be at most 2000 characters'],
      default: '',
    },
    service_type: {
      type: String,
      required: [true, 'Service type is required'],
      trim: true,
    },
    price: {
      type: Number,
      min: [0, 'Price cannot be negative'],
      default: 0,
    },
    commission_rate: {
      type: Number,
      min: 0,
      max: 100,
      default: 15,
    },
    commission_amount: {
      type: Number,
      min: 0,
      default: 0,
    },
    provider_amount: {
      type: Number,
      min: 0,
      default: 0,
    },
    settled: {
      type: Boolean,
      default: false,
    },
    settled_at: {
      type: Date,
      default: null,
    },
    payment_status: {
      type: String,
      enum: ['unpaid', 'reserved', 'collected'],
      default: 'unpaid',
    },
    payment_method: {
      type: String,
      enum: ['none', 'mastercard'],
      default: 'none',
    },
    payment_agreed_at: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    // The catalog service this order was created from (null for custom orders)
    service_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      default: null,
    },
    // Admin feedback when a submitted order is sent back to the provider
    review_note: {
      type: String,
      trim: true,
      maxlength: [500, 'Review note must be at most 500 characters'],
      default: '',
    },
    student_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Student ID is required'],
    },
    provider_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: {
        values: Object.values(ORDER_STATUS),
        message: 'Invalid order status',
      },
      default: ORDER_STATUS.PENDING,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    toJSON: {
      transform(doc, ret) {
        // Convert _id to id string
        ret.id = doc._id.toString();
        // Convert ObjectId references to string IDs (populated or not)
        // student_id/provider_id may be populated documents — always output the plain id string
        const toId = (v) => (v ? (v._id ? v._id : v).toString() : null);
        ret.studentId = toId(doc.student_id);
        ret.providerId = toId(doc.provider_id);
        ret.serviceId = toId(doc.service_id);
        ret.reviewNote = doc.review_note || '';
        ret.commissionRate = doc.commission_rate ?? 15;
        ret.commissionAmount = doc.commission_amount ?? 0;
        ret.providerAmount = doc.provider_amount ?? 0;
        ret.settled = Boolean(doc.settled);
        ret.settledAt = doc.settled_at || null;
        ret.paymentStatus = doc.payment_status || 'unpaid';
        ret.paymentMethod = doc.payment_method || 'none';
        ret.paymentAgreedAt = doc.payment_agreed_at || null;
        ret.createdAt = doc.created_at;
        ret.updatedAt = doc.updated_at;
        // Add populated user objects as nested objects if present
        if (doc.student_id && typeof doc.student_id === 'object' && doc.student_id.toJSON) {
          ret.student = doc.student_id.toJSON();
        } else {
          ret.student = null;
        }
        if (doc.provider_id && typeof doc.provider_id === 'object' && doc.provider_id.toJSON) {
          ret.provider = doc.provider_id.toJSON();
        } else {
          ret.provider = null;
        }
        // Remove mongoose fields and original refs
        delete ret._id;
        delete ret.__v;
        delete ret.student_id;
        delete ret.provider_id;
        delete ret.service_id;
        delete ret.review_note;
        delete ret.commission_rate;
        delete ret.commission_amount;
        delete ret.provider_amount;
        delete ret.settled_at;
        delete ret.payment_status;
        delete ret.payment_method;
        delete ret.payment_agreed_at;
        return ret;
      },
    },
  }
);

/**
 * Indexes for efficient queries
 */
orderSchema.index({ student_id: 1, status: 1 });
orderSchema.index({ provider_id: 1, status: 1 });
orderSchema.index({ status: 1, created_at: -1 });

/**
 * Cascade delete messages when an order is deleted.
 */
orderSchema.pre('findOneAndDelete', async function () {
  const order = await this.model.findOne(this.getFilter());
  if (order) {
    const Report = (await import('./Report.js')).default;
    await Promise.all([
      Message.deleteMany({ order_id: order._id }),
      Notification.deleteMany({ order_id: order._id }),
      Report.deleteMany({ order_id: order._id }),
    ]);
  }
});

const Order = mongoose.model('Order', orderSchema);
export default Order;
