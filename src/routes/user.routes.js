import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  upgradeSubscription,
  updatePublicKey,
  getPublicKey,
  getPublicProfile,
  getAllUsers,
  deleteUser,
} from '../controllers/user.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorize } from '../middlewares/role.middleware.js';
import { ROLES } from '../utils/constants.js';

const router = Router();

// All user routes require authentication
router.use(authenticate);

// GET /api/user/profile
router.get('/profile', getProfile);

// PATCH /api/user/profile
router.patch('/profile', updateProfile);

// POST /api/user/upgrade
router.post('/upgrade', upgradeSubscription);

// POST /api/user/public-key
router.post('/public-key', updatePublicKey);

// GET /api/user/:id/public — name, phone, bio, order counts (for chat popup / profiles)
router.get('/:id/public', getPublicProfile);

// GET /api/user/:id/public-key
router.get('/:id/public-key', getPublicKey);

// GET /api/users — admin only
router.get('/', authorize(ROLES.ADMIN), getAllUsers);

// DELETE /api/users/:id — admin only
router.delete('/:id', authorize(ROLES.ADMIN), deleteUser);

export default router;
