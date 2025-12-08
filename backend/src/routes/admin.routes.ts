import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import * as adminController from '../controllers/admin.controller';
import issueRoutes from './issue.routes';

const router = Router();

// All routes require authentication and ADMIN role
router.use(authenticate);
router.use(authorize('ADMIN'));

/**
 * Admin Dashboard Routes (ADMIN only)
 */

// Dashboard statistics
// GET /api/admin/dashboard/stats
router.get('/dashboard/stats', adminController.getDashboardStats);

// System health
// GET /api/admin/system/health
router.get('/system/health', adminController.getSystemHealth);

// Audit logs with filters
// GET /api/admin/audit-logs?page=1&limit=20&userId=xxx&action=CREATE&entity=User&startDate=2025-01-01&endDate=2025-12-31&search=john
router.get('/audit-logs', adminController.getAuditLogs);

// Recent activity (last 24 hours)
// GET /api/admin/activity/recent?limit=50
router.get('/activity/recent', adminController.getRecentActivity);

// Login history
// GET /api/admin/activity/logins?page=1&limit=20
router.get('/activity/logins', adminController.getLoginHistory);

// Failed login attempts
// GET /api/admin/activity/failed-logins?page=1&limit=20
router.get('/activity/failed-logins', adminController.getFailedLogins);

// Statistics by date range
// GET /api/admin/stats/date-range?startDate=2025-01-01&endDate=2025-12-31
router.get('/stats/date-range', adminController.getStatsByDateRange);

// Most active users
// GET /api/admin/stats/active-users?limit=10
router.get('/stats/active-users', adminController.getMostActiveUsers);

// Issue tracking routes (mounted under /api/admin/issues)
router.use('/issues', issueRoutes);

export default router;
