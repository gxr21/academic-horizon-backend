import mongoose from 'mongoose';

/**
 * Report Schema
 * A provider reports a student (from a conversation) to the admin for review.
 */
const reportSchema = new mongoose.Schema(
  {
    reporter_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reported_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    reason: {
      type: String,
      enum: ['harassment', 'spam', 'inappropriate', 'fraud', 'other'],
      required: true,
    },
    details: {
      type: String,
      trim: true,
      maxlength: [1000, 'Details must be at most 1000 characters'],
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'dismissed', 'actioned'],
      default: 'pending',
      index: true,
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
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
      transform(doc, ret) {
        const toId = (v) => (v ? (v._id ? v._id : v).toString() : null);
        ret.id = doc._id.toString();
        ret.reporterId = toId(doc.reporter_id);
        ret.reportedId = toId(doc.reported_id);
        ret.orderId = toId(doc.order_id);
        ret.reviewedBy = toId(doc.reviewed_by);
        ret.createdAt = doc.created_at;
        ret.updatedAt = doc.updated_at;
        if (doc.reporter_id && typeof doc.reporter_id === 'object' && doc.reporter_id.name) {
          ret.reporter = { id: ret.reporterId, name: doc.reporter_id.name, email: doc.reporter_id.email };
        }
        if (doc.reported_id && typeof doc.reported_id === 'object' && doc.reported_id.name) {
          ret.reported = {
            id: ret.reportedId,
            name: doc.reported_id.name,
            email: doc.reported_id.email,
            restrictionType: doc.reported_id.restriction_type || 'none',
            restrictionUntil: doc.reported_id.restriction_until || null,
            restrictionReason: doc.reported_id.restriction_reason || '',
          };
        }
        if (doc.order_id && typeof doc.order_id === 'object' && doc.order_id.title) {
          ret.order = {
            id: ret.orderId,
            title: doc.order_id.title,
            status: doc.order_id.status,
          };
        }
        delete ret._id;
        delete ret.__v;
        delete ret.reporter_id;
        delete ret.reported_id;
        delete ret.order_id;
        delete ret.reviewed_by;
        delete ret.created_at;
        delete ret.updated_at;
        return ret;
      },
    },
  }
);

reportSchema.index({ reporter_id: 1, order_id: 1, status: 1 });

const Report = mongoose.model('Report', reportSchema);
export default Report;
