import mongoose from 'mongoose';

/**
 * A provider asks the admin to change personal details.
 * Identity documents stay on disk; the server never serves them as a page.
 */
const profileChangeRequestSchema = new mongoose.Schema(
  {
    provider_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    requested_name: { type: String, trim: true, default: '' },
    requested_phone: { type: String, trim: true, default: '' },
    requested_email: { type: String, trim: true, lowercase: true, default: '' },
    requested_bio: { type: String, trim: true, maxlength: 1000, default: '' },
    note: { type: String, trim: true, maxlength: 500, default: '' },
    documents: {
      type: [
        {
          _id: false,
          stored_name: { type: String, required: true },
          original_name: { type: String, required: true },
          file_path: { type: String, required: true },
          mime_type: { type: String, default: 'application/octet-stream' },
          size: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    admin_note: { type: String, trim: true, maxlength: 500, default: '' },
    reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewed_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
      transform(doc, ret) {
        const toId = (v) => (v ? (v._id ? v._id : v).toString() : null);
        ret.id = doc._id.toString();
        ret.providerId = toId(doc.provider_id);
        ret.requestedName = doc.requested_name || '';
        ret.requestedPhone = doc.requested_phone || '';
        ret.requestedEmail = doc.requested_email || '';
        ret.requestedBio = doc.requested_bio || '';
        ret.note = doc.note || '';
        ret.status = doc.status;
        ret.adminNote = doc.admin_note || '';
        ret.reviewedBy = toId(doc.reviewed_by);
        ret.reviewedAt = doc.reviewed_at;
        ret.createdAt = doc.created_at;
        ret.updatedAt = doc.updated_at;
        ret.documents = (doc.documents || []).map((d, index) => ({
          index,
          originalName: d.original_name,
          mimeType: d.mime_type,
          size: d.size,
        }));
        if (doc.provider_id && typeof doc.provider_id === 'object' && doc.provider_id.name) {
          ret.provider = {
            id: ret.providerId,
            name: doc.provider_id.name,
            email: doc.provider_id.email,
            phone: doc.provider_id.phone || '',
            bio: doc.provider_id.bio || '',
          };
        }
        delete ret._id;
        delete ret.__v;
        delete ret.provider_id;
        delete ret.requested_name;
        delete ret.requested_phone;
        delete ret.requested_email;
        delete ret.requested_bio;
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

const ProfileChangeRequest = mongoose.model('ProfileChangeRequest', profileChangeRequestSchema);
export default ProfileChangeRequest;
