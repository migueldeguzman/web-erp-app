import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import * as userController from '../controllers/user.controller';

const router = Router();

// All routes require authentication and ADMIN role
router.use(authenticate);
router.use(authorize('ADMIN'));

/**
 * User Management Routes (ADMIN only)
 */

// List all users with pagination and filters
// GET /api/users?page=1&limit=10&role=ACCOUNTANT&isActive=true&search=john
router.get('/', userController.listUsers);

// Get single user details
// GET /api/users/:id
router.get('/:id', userController.getUserById);

// Create new user
// POST /api/users
router.post('/', userController.createUser);

// Update user details
// PUT /api/users/:id
router.put('/:id', userController.updateUser);

// Deactivate user (soft delete)
// POST /api/users/:id/deactivate
router.post('/:id/deactivate', userController.deactivateUser);

// Reactivate user
// POST /api/users/:id/reactivate
router.post('/:id/reactivate', userController.reactivateUser);

// Delete user permanently (use with caution)
// DELETE /api/users/:id
router.delete('/:id', userController.deleteUser);

// Get user activity logs
// GET /api/users/:id/activity?page=1&limit=20
router.get('/:id/activity', userController.getUserActivity);

// Get user statistics
// GET /api/users/:id/stats
router.get('/:id/stats', userController.getUserStats);

export default router;
