import mongoose from 'mongoose';

/**
 * Service Schema
 * A service offered on the platform. Created/managed by admins,
 * visible to students who can order it.
 */
const serviceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Service title is required'],
      trim: true,
      maxlength: [100, 'Title must be at most 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description must be at most 1000 characters'],
      default: '',
    },
    price: {
      type: Number,
      min: [0, 'Price cannot be negative'],
      default: 0,
    },
    service_type: {
      type: String,
      trim: true,
      default: 'general',
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
      transform(doc, ret) {
        ret.id = doc._id.toString();
        ret.serviceType = doc.service_type;
        ret.isActive = doc.is_active;
        ret.createdAt = doc.created_at;
        ret.updatedAt = doc.updated_at;
        delete ret._id;
        delete ret.__v;
        delete ret.service_type;
        delete ret.is_active;
        delete ret.created_by;
        delete ret.created_at;
        delete ret.updated_at;
        return ret;
      },
    },
  }
);

serviceSchema.index({ is_active: 1, created_at: -1 });

const Service = mongoose.model('Service', serviceSchema);
export default Service;
