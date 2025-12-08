import { Response, NextFunction } from 'express';
import { AppError, asyncHandler } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/database';
import { AdminService } from '../services/admin.service';
import { AuditAction } from '@prisma/client';

const adminService = new AdminService(prisma);

/**
 * Get comprehensive dashboard statistics
 * GET /api/admin/dashboard/stats
 */
export const getDashboardStats = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const stats = await adminService.getDashboardStats();

    res.json({
      status: 'success',
      data: stats,
    });
  }
);

/**
 * Get system health status
 * GET /api/admin/system/health
 */
export const getSystemHealth = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const health = await adminService.getSystemHealth();

    res.json({
      status: 'success',
      data: health,
    });
  }
);

/**
 * Get paginated audit logs with filters
 * GET /api/admin/audit-logs?page=1&limit=20&userId=xxx&action=CREATE&entity=User&startDate=2025-01-01&endDate=2025-12-31&search=john
 */
export const getAuditLogs = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const userId = req.query.userId as string | undefined;
    const action = req.query.action as AuditAction | undefined;
    const entity = req.query.entity as string | undefined;
    const search = req.query.search as string | undefined;

    // Parse dates if provided
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (req.query.startDate) {
      startDate = new Date(req.query.startDate as string);
      if (isNaN(startDate.getTime())) {
        throw new AppError('Invalid startDate format', 400);
      }
    }

    if (req.query.endDate) {
      endDate = new Date(req.query.endDate as string);
      if (isNaN(endDate.getTime())) {
        throw new AppError('Invalid endDate format', 400);
      }
    }

    const result = await adminService.getAuditLogs(page, limit, {
      userId,
      action,
      entity,
      startDate,
      endDate,
      search,
    });

    res.json({
      status: 'success',
      data: result,
    });
  }
);

/**
 * Get recent activity (last 24 hours)
 * GET /api/admin/activity/recent?limit=50
 */
export const getRecentActivity = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const limit = parseInt(req.query.limit as string) || 50;

    const logs = await adminService.getRecentActivity(limit);

    res.json({
      status: 'success',
      data: { logs },
    });
  }
);

/**
 * Get user login history
 * GET /api/admin/activity/logins?page=1&limit=20
 */
export const getLoginHistory = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await adminService.getLoginHistory(page, limit);

    res.json({
      status: 'success',
      data: result,
    });
  }
);

/**
 * Get failed login attempts
 * GET /api/admin/activity/failed-logins?page=1&limit=20
 */
export const getFailedLogins = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await adminService.getFailedLogins(page, limit);

    res.json({
      status: 'success',
      data: result,
    });
  }
);

/**
 * Get statistics for a specific date range
 * GET /api/admin/stats/date-range?startDate=2025-01-01&endDate=2025-12-31
 */
export const getStatsByDateRange = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const startDateStr = req.query.startDate as string;
    const endDateStr = req.query.endDate as string;

    if (!startDateStr || !endDateStr) {
      throw new AppError('startDate and endDate are required', 400);
    }

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new AppError('Invalid date format', 400);
    }

    if (startDate > endDate) {
      throw new AppError('startDate must be before endDate', 400);
    }

    const stats = await adminService.getStatsByDateRange(startDate, endDate);

    res.json({
      status: 'success',
      data: stats,
    });
  }
);

/**
 * Get most active users
 * GET /api/admin/stats/active-users?limit=10
 */
export const getMostActiveUsers = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const limit = parseInt(req.query.limit as string) || 10;

    const users = await adminService.getMostActiveUsers(limit);

    res.json({
      status: 'success',
      data: { users },
    });
  }
);
