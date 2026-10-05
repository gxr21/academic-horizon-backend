import mongoose from 'mongoose';

/**
 * Notification Schema
 * Persistent, per-user notifications (also pushed in real time via Socket.io).
 */
const notificationSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    service_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      default: null,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    toJSON: {
      transform(doc, ret) {
        ret.id = doc._id.toString();
        ret.userId = doc.user_id ? doc.user_id.toString() : null;
        ret.orderId = doc.order_id ? doc.order_id.toString() : null;
        ret.serviceId = doc.service_id ? doc.service_id.toString() : null;
        ret.timestamp = doc.created_at;
        delete ret._id;
        delete ret.__v;
        delete ret.user_id;
        delete ret.order_id;
        delete ret.service_id;
        delete ret.created_at;
        return ret;
      },
    },
  }
);

notificationSchema.index({ user_id: 1, created_at: -1 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
