import { Response, NextFunction } from 'express';
import { AppError, asyncHandler } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/database';
import { IssueService } from '../services/issue.service';
import { AuditService } from '../services/audit.service';
import { IssuePriority, IssueStatus, IssueType } from '@prisma/client';

const auditService = new AuditService(prisma);
const issueService = new IssueService(prisma, auditService);

/**
 * Get paginated list of issues with filters
 * GET /api/admin/issues?page=1&limit=20&status=OPEN&priority=HIGH&type=BUG&search=login
 */
export const listIssues = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as IssueStatus | undefined;
    const priority = req.query.priority as IssuePriority | undefined;
    const type = req.query.type as IssueType | undefined;
    const reportedById = req.query.reportedById as string | undefined;
    const assignedToId = req.query.assignedToId as string | undefined;
    const search = req.query.search as string | undefined;

    const result = await issueService.listIssues(page, limit, {
      status,
      priority,
      type,
      reportedById,
      assignedToId,
      search,
    });

    res.json({
      status: 'success',
      data: result,
    });
  }
);

/**
 * Get single issue by ID with comments
 * GET /api/admin/issues/:id
 */
export const getIssueById = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;

    try {
      const issue = await issueService.getIssueById(id);
      res.json({
        status: 'success',
        data: { issue },
      });
    } catch (error: any) {
      throw new AppError(error.message, 404);
    }
  }
);

/**
 * Create new issue
 * POST /api/admin/issues
 * Body: { title, description, type, priority?, assignedToId?, environment?, affectedUrl?, stackTrace?, browserInfo? }
 */
export const createIssue = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const {
      title,
      description,
      type,
      priority,
      assignedToId,
      environment,
      affectedUrl,
      stackTrace,
      browserInfo,
    } = req.body;

    // Validation
    if (!title || !description || !type) {
      throw new AppError('Title, description, and type are required', 400);
    }

    if (!['BUG', 'FEATURE_REQUEST', 'SUPPORT', 'SECURITY', 'PERFORMANCE', 'OTHER'].includes(type)) {
      throw new AppError('Invalid issue type', 400);
    }

    try {
      const issue = await issueService.createIssue(
        {
          title,
          description,
          type,
          priority,
          reportedById: req.user.id,
          assignedToId,
          environment,
          affectedUrl,
          stackTrace,
          browserInfo,
        },
        {
          userId: req.user.id,
          ipAddress: req.auditContext?.ipAddress,
          userAgent: req.auditContext?.userAgent,
          requestId: req.auditContext?.requestId,
        }
      );

      res.status(201).json({
        status: 'success',
        data: { issue },
      });
    } catch (error: any) {
      throw new AppError(error.message, 400);
    }
  }
);

/**
 * Update issue
 * PUT /api/admin/issues/:id
 * Body: { title?, description?, type?, priority?, status?, assignedToId?, environment?, affectedUrl?, stackTrace?, browserInfo? }
 */
export const updateIssue = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;
    const {
      title,
      description,
      type,
      priority,
      status,
      assignedToId,
      environment,
      affectedUrl,
      stackTrace,
      browserInfo,
    } = req.body;

    try {
      const issue = await issueService.updateIssue(
        id,
        {
          title,
          description,
          type,
          priority,
          status,
          assignedToId,
          environment,
          affectedUrl,
          stackTrace,
          browserInfo,
        },
        {
          userId: req.user.id,
          ipAddress: req.auditContext?.ipAddress,
          userAgent: req.auditContext?.userAgent,
          requestId: req.auditContext?.requestId,
        }
      );

      res.json({
        status: 'success',
        data: { issue },
      });
    } catch (error: any) {
      throw new AppError(error.message, 400);
    }
  }
);

/**
 * Delete issue
 * DELETE /api/admin/issues/:id
 */
export const deleteIssue = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;

    try {
      const result = await issueService.deleteIssue(id, {
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
 * Add comment to issue
 * POST /api/admin/issues/:id/comments
 * Body: { comment }
 */
export const addComment = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;
    const { comment } = req.body;

    if (!comment) {
      throw new AppError('Comment is required', 400);
    }

    try {
      const issueComment = await issueService.addComment(id, req.user.id, comment, {
        userId: req.user.id,
        ipAddress: req.auditContext?.ipAddress,
        userAgent: req.auditContext?.userAgent,
        requestId: req.auditContext?.requestId,
      });

      res.status(201).json({
        status: 'success',
        data: { comment: issueComment },
      });
    } catch (error: any) {
      throw new AppError(error.message, 400);
    }
  }
);

/**
 * Get issue statistics
 * GET /api/admin/issues/stats
 */
export const getIssueStats = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const stats = await issueService.getIssueStats();

    res.json({
      status: 'success',
      data: stats,
    });
  }
);
