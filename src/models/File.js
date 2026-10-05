import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema(
  {
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order ID is required'],
      index: true,
    },
    uploader_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Uploader ID is required'],
    },
    original_name: {
      type: String,
      required: [true, 'Original filename is required'],
    },
    mime_type: {
      type: String,
      required: true,
    },
    file_path: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        ret.orderId = ret.order_id;
        ret.uploaderId = ret.uploader_id;
        ret.originalName = ret.original_name;
        ret.mimeType = ret.mime_type;
        // NOTE: the server-side file path is intentionally NOT exposed to clients
        ret.createdAt = ret.created_at;
        ret.updatedAt = ret.updated_at;
        delete ret.order_id;
        delete ret.uploader_id;
        delete ret.original_name;
        delete ret.mime_type;
        delete ret.file_path;
        delete ret.created_at;
        delete ret.updated_at;
        return ret;
      },
    },
  }
);

const File = mongoose.model('File', fileSchema);
export default File;
