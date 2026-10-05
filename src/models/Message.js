import mongoose from 'mongoose';

/**
 * Message Schema
 * Stores E2EE encrypted messages only.
 * Server NEVER sees plaintext.
 */
const messageSchema = new mongoose.Schema(
  {
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order ID is required'],
      index: true,
    },
    sender_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender ID is required'],
    },
    encrypted_message: {
      type: String,
      required: [true, 'Encrypted message is required'],
    },
    iv: {
      type: String,
      required: [true, 'IV is required'],
    },
    wrapped_key: {
      type: String,
      default: null,
    },
    // AES key wrapped with the SENDER's public key, so the sender can
    // also decrypt their own messages after reload.
    sender_wrapped_key: {
      type: String,
      default: null,
    },
    // Safety review: the AES key also wrapped with each ADMIN's public key, so admins
    // (and only admins, with their private key) can read the conversation.
    admin_wrapped_keys: {
      type: [
        {
          _id: false,
          admin_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
          wrapped_key: { type: String, required: true },
        },
      ],
      default: [],
    },
    message_type: {
      type: String,
      enum: {
        values: ['text', 'file', 'system'],
        message: 'Message type must be text, file, or system',
      },
      default: 'text',
    },
    // Read receipts — array of user IDs who have read this message
    read_by: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'User',
      default: [],
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
        // sender_id/order_id may be populated documents — always output the plain id string
        const toId = (v) => (v ? (v._id ? v._id : v).toString() : null);
        ret.orderId = toId(doc.order_id);
        ret.senderId = toId(doc.sender_id);
        ret.encryptedMessage = doc.encrypted_message;
        ret.iv = doc.iv;
        ret.wrappedKey = doc.wrapped_key;
        ret.senderWrappedKey = doc.sender_wrapped_key;
        ret.messageType = doc.message_type;
        ret.createdAt = doc.created_at;
        ret.readBy = doc.read_by ? doc.read_by.map((id) => id.toString()) : [];
        if (doc.sender_id && typeof doc.sender_id === 'object' && doc.sender_id.toJSON) {
          ret.sender = doc.sender_id.toJSON();
        } else {
          ret.sender = null;
        }
        delete ret._id;
        delete ret.__v;
        delete ret.order_id;
        delete ret.sender_id;
        delete ret.encrypted_message;
        delete ret.wrapped_key;
        delete ret.sender_wrapped_key;
        delete ret.admin_wrapped_keys; // only exposed through the admin review endpoint
        delete ret.message_type;
        delete ret.created_at;
        delete ret.read_by;
        return ret;
      },
    },
  }
);

/**
 * Indexes for efficient querying
 */
messageSchema.index({ order_id: 1, created_at: 1 });
messageSchema.index({ sender_id: 1 });

const Message = mongoose.model('Message', messageSchema);
export default Message;
