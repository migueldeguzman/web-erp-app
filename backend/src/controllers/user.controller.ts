import { Response, NextFunction } from 'express';
import { AppError, asyncHandler } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/database';
import { UserService } from '../services/user.service';
import { AuditService } from '../services/audit.service';
import { UserRole } from '@prisma/client';

const auditService = new AuditService(prisma);
const userService = new UserService(prisma, auditService);

/**
 * Get paginated list of all users (ADMIN only)
 * GET /api/users?page=1&limit=10&role=ACCOUNTANT&isActive=true&search=john
 */
export const listUsers = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const role = req.query.role as UserRole | undefined;
    const isActive =
      req.query.isActive === 'true'
        ? true
        : req.query.isActive === 'false'
        ? false
        : undefined;
    const search = req.query.search as string | undefined;

    const result = await userService.listUsers(page, limit, {
      role,
      isActive,
      search,
    });

    res.json({
      status: 'success',
      data: result,
    });
  }
);

/**
 * Get single user by ID with detailed information (ADMIN only)
 * GET /api/users/:id
 */
export const getUserById = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;

    try {
      const user = await userService.getUserById(id);
      res.json({
        status: 'success',
        data: { user },
      });
    } catch (error: any) {
      throw new AppError(error.message, 404);
    }
  }
);

/**
 * Create new user (ADMIN only)
 * POST /api/users
 * Body: { email, password, firstName, lastName, role }
 */
export const createUser = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { email, password, firstName, lastName, role } = req.body;

    // Validation
    if (!email || !password || !firstName || !lastName || !role) {
      throw new AppError('All fields are required', 400);
    }

    if (!['ADMIN', 'ACCOUNTANT', 'MANAGER', 'VIEWER'].includes(role)) {
      throw new AppError('Invalid role', 400);
    }

    try {
      const user = await userService.createUser(
        { email, password, firstName, lastName, role },
        {
          userId: req.user.id,
          ipAddress: req.auditContext?.ipAddress,
          userAgent: req.auditContext?.userAgent,
          requestId: req.auditContext?.requestId,
        }
      );

      res.status(201).json({
        status: 'success',
        data: { user },
      });
    } catch (error: any) {
      throw new AppError(error.message, 400);
    }
  }
);

/**
 * Update user details (ADMIN only)
 * PUT /api/users/:id
 * Body: { email?, firstName?, lastName?, role?, isActive? }
 */
export const updateUser = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;
    const { email, firstName, lastName, role, isActive } = req.body;

    // Validation: role must be valid if provided
    if (role && !['ADMIN', 'ACCOUNTANT', 'MANAGER', 'VIEWER'].includes(role)) {
      throw new AppError('Invalid role', 400);
    }

    try {
      const user = await userService.updateUser(
        id,
        { email, firstName, lastName, role, isActive },
        {
          userId: req.user.id,
          ipAddress: req.auditContext?.ipAddress,
          userAgent: req.auditContext?.userAgent,
          requestId: req.auditContext?.requestId,
        }
      );

      res.json({
        status: 'success',
        data: { user },
      });
    } catch (error: any) {
      throw new AppError(error.message, 400);
    }
  }
);

/**
 * Deactivate user (soft delete) (ADMIN only)
 * POST /api/users/:id/deactivate
 */
export const deactivateUser = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;

    // Prevent self-deactivation
    if (id === req.user.id) {
      throw new AppError('You cannot deactivate your own account', 400);
    }

    try {
      const result = await userService.deactivateUser(id, {
        userId: req.user.id,
        ipAddress: req.auditContext?.ipAddress,
        userAgent: req.auditContext?.userAgent,
        requestId: req.auditContext?.requestId,
      });

      res.json({
        status: 'success',
        data: result,
      });
    } catch (error: any) {
      throw new AppError(error.message, 400);
    }
  }
);

/**
 * Reactivate user (ADMIN only)
 * POST /api/users/:id/reactivate
 */
export const reactivateUser = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;

    try {
      const result = await userService.reactivateUser(id, {
        userId: req.user.id,
        ipAddress: req.auditContext?.ipAddress,
        userAgent: req.auditContext?.userAgent,
        requestId: req.auditContext?.requestId,
      });

      res.json({
        status: 'success',
        data: result,
      });
    } catch (error: any) {
      throw new AppError(error.message, 400);
    }
  }
);

/**
 * Delete user permanently (ADMIN only) - use with extreme caution
 * DELETE /api/users/:id
 */
export const deleteUser = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;

    // Prevent self-deletion
    if (id === req.user.id) {
      throw new AppError('You cannot delete your own account', 400);
    }

    try {
      const result = await userService.deleteUser(id, {
        userId: req.user.id,
        ipAddress: req.auditContext?.ipAddress,
        userAgent: req.auditContext?.userAgent,
        requestId: req.auditContext?.requestId,
      });

      res.json({
        status: 'success',
        data: result,
      });
    } catch (error: any) {
      throw new AppError(error.message, 400);
    }
  }
);

/**
 * Get user activity logs (ADMIN only)
 * GET /api/users/:id/activity?page=1&limit=20
 */
export const getUserActivity = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    try {
      const result = await userService.getUserActivity(id, page, limit);
      res.json({
        status: 'success',
        data: result,
      });
    } catch (error: any) {
      throw new AppError(error.message, 404);
    }
  }
);

/**
 * Get user statistics (ADMIN only)
 * GET /api/users/:id/stats
 */
export const getUserStats = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;

    try {
      const stats = await userService.getUserStats(id);
      res.json({
        status: 'success',
        data: stats,
      });
    } catch (error: any) {
      throw new AppError(error.message, 404);
    }
  }
);
