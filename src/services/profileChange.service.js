import fs from 'node:fs/promises';
import ProfileChangeRequest from '../models/ProfileChangeRequest.js';
import User from '../models/User.js';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from '../utils/errors.js';
import { ROLES } from '../utils/constants.js';
import { notifyRole, notifyUsers } from './notification.service.js';

const populate = (query) => query.populate('provider_id', 'name email phone bio role');

const discardFiles = async (files = []) => {
  await Promise.all(
    files.map((f) => (f?.path ? fs.unlink(f.path).catch(() => {}) : Promise.resolve()))
  );
};

export const createChangeRequest = async ({ providerId, fields, files, note }) => {
  const provider = await User.findById(providerId);
  if (!provider || provider.role !== ROLES.PROVIDER) {
    throw new ForbiddenError('فقط مزود الخدمة يرسل طلب تغيير البيانات');
  }

  const pending = await ProfileChangeRequest.findOne({
    provider_id: providerId,
    status: 'pending',
  });
  if (pending) {
    await discardFiles(files);
    throw new ConflictError('لديك طلب تغيير قيد المراجعة. انتظر قرار الإدارة أولاً.');
  }

  const requestedName = (fields.name || '').trim();
  const requestedPhone = (fields.phone || '').trim();
  const requestedEmail = (fields.email || '').trim().toLowerCase();
  const requestedBio = (fields.bio || '').trim();

  const changed =
    (requestedName && requestedName !== provider.name) ||
    (requestedPhone && requestedPhone !== (provider.phone || '')) ||
    (requestedEmail && requestedEmail !== provider.email) ||
    (requestedBio && requestedBio !== (provider.bio || ''));

  if (!changed) {
    await discardFiles(files);
    throw new ValidationError('لم يُطلب أي تغيير في البيانات');
  }

  if (!files || files.length === 0) {
    throw new ValidationError('ارفع مستمسكاً واحداً على الأقل (مثل الهوية الشخصية)');
  }

  if (requestedEmail && requestedEmail !== provider.email) {
    if (await User.findOne({ email: requestedEmail })) {
      await discardFiles(files);
      throw new ConflictError('هذا البريد مسجّل مسبقاً');
    }
  }

  const request = await ProfileChangeRequest.create({
    provider_id: providerId,
    requested_name: requestedName,
    requested_phone: requestedPhone,
    requested_email: requestedEmail,
    requested_bio: requestedBio,
    note: (note || '').trim(),
    documents: files.map((f) => ({
      stored_name: f.filename,
      original_name: f.originalname,
      file_path: f.path,
      mime_type: f.mimetype,
      size: f.size,
    })),
  });

  await notifyRole(ROLES.ADMIN, {
    type: 'provider_profile_change',
    title: 'طلب تغيير بيانات مزود خدمة',
    message: `طلب ${provider.name} تحديث بياناته الشخصية.`,
  });

  return populate(ProfileChangeRequest.findById(request._id));
};

export const listMine = async (providerId) => {
  const requests = await populate(
    ProfileChangeRequest.find({ provider_id: providerId }).sort({ created_at: -1 }).limit(20)
  );
  return requests.map((r) => r.toJSON());
};

export const listAll = async ({ page = 1, limit = 50, status } = {}) => {
  const query = {};
  if (status) query.status = status;
  const skip = (page - 1) * limit;
  const [requests, total] = await Promise.all([
    populate(ProfileChangeRequest.find(query)).sort({ created_at: -1 }).skip(skip).limit(limit),
    ProfileChangeRequest.countDocuments(query),
  ]);
  return {
    requests: requests.map((r) => r.toJSON()),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
};

export const reviewRequest = async ({ requestId, adminId, status, adminNote = '' }) => {
  const request = await ProfileChangeRequest.findById(requestId);
  if (!request) throw new NotFoundError('ProfileChangeRequest');
  if (request.status !== 'pending') {
    throw new ValidationError('هذا الطلب تمت مراجعته مسبقاً');
  }
  if (!['approved', 'rejected'].includes(status)) {
    throw new ValidationError('Status must be approved or rejected');
  }

  if (status === 'approved') {
    const provider = await User.findById(request.provider_id);
    if (!provider) throw new NotFoundError('User');
    if (request.requested_name) provider.name = request.requested_name;
    if (request.requested_phone) provider.phone = request.requested_phone;
    if (request.requested_bio) provider.bio = request.requested_bio;
    if (request.requested_email && request.requested_email !== provider.email) {
      if (await User.findOne({ email: request.requested_email, _id: { $ne: provider._id } })) {
        throw new ConflictError('هذا البريد مسجّل مسبقاً');
      }
      provider.email = request.requested_email;
    }
    await provider.save();
  }

  request.status = status;
  request.admin_note = adminNote;
  request.reviewed_by = adminId;
  request.reviewed_at = new Date();
  await request.save();

  await notifyUsers([request.provider_id], {
    type: 'provider_profile_change',
    title: status === 'approved' ? 'تمت الموافقة على طلب التغيير' : 'رُفض طلب تغيير البيانات',
    message:
      status === 'approved'
        ? 'حدّثت الإدارة بياناتك الشخصية.'
        : adminNote || 'رفضت الإدارة طلب تغيير بياناتك.',
  });

  return populate(ProfileChangeRequest.findById(request._id));
};

export const getDocument = async ({ requestId, index, user }) => {
  const request = await ProfileChangeRequest.findById(requestId);
  if (!request) throw new NotFoundError('ProfileChangeRequest');
  const isOwner = request.provider_id.toString() === user.id;
  if (user.role !== ROLES.ADMIN && !isOwner) {
    throw new ForbiddenError('Access denied');
  }
  const doc = request.documents[Number(index)];
  if (!doc) throw new NotFoundError('Document');
  return doc;
};
