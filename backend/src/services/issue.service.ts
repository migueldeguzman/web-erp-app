import { PrismaClient, IssuePriority, IssueStatus, IssueType, Prisma } from '@prisma/client';
import { AuditService } from './audit.service';

export interface CreateIssueInput {
  title: string;
  description: string;
  type: IssueType;
  priority?: IssuePriority;
  reportedById: string;
  assignedToId?: string;
  environment?: string;
  affectedUrl?: string;
  stackTrace?: string;
  browserInfo?: string;
}

export interface UpdateIssueInput {
  title?: string;
  description?: string;
  type?: IssueType;
  priority?: IssuePriority;
  status?: IssueStatus;
  assignedToId?: string;
  environment?: string;
  affectedUrl?: string;
  stackTrace?: string;
  browserInfo?: string;
}

export interface IssueFilters {
  status?: IssueStatus;
  priority?: IssuePriority;
  type?: IssueType;
  reportedById?: string;
  assignedToId?: string;
  search?: string;
}

export class IssueService {
  constructor(
    private prisma: PrismaClient,
    private auditService: AuditService
  ) {}

  /**
   * Get paginated list of issues with filters
   */
  async listIssues(
    page: number = 1,
    limit: number = 20,
    filters: IssueFilters = {}
  ) {
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.IssueWhereInput = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.priority) {
      where.priority = filters.priority;
    }

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.reportedById) {
      where.reportedById = filters.reportedById;
    }

    if (filters.assignedToId) {
      where.assignedToId = filters.assignedToId;
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Get total count and issues
    const [total, issues] = await Promise.all([
      this.prisma.issue.count({ where }),
      this.prisma.issue.findMany({
        where,
        skip,
        take: limit,
        include: {
          reportedBy: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
          assignedTo: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
          _count: {
            select: {
              comments: true,
            },
          },
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
      }),
    ]);

    return {
      issues,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single issue by ID with comments
   */
  async getIssueById(issueId: string) {
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      include: {
        reportedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        comments: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!issue) {
      throw new Error('Issue not found');
    }

    return issue;
  }

  /**
   * Create new issue
   */
  async createIssue(
    input: CreateIssueInput,
    context: { userId: string; ipAddress?: string; userAgent?: string; requestId?: string }
  ) {
    // Verify users exist
    if (input.assignedToId) {
      const assignedUser = await this.prisma.user.findUnique({
        where: { id: input.assignedToId },
      });

      if (!assignedUser) {
        throw new Error('Assigned user not found');
      }
    }

    const issue = await this.prisma.$transaction(async (tx) => {
      const newIssue = await tx.issue.create({
        data: {
          title: input.title,
          description: input.description,
          type: input.type,
          priority: input.priority || 'MEDIUM',
          reportedById: input.reportedById,
          assignedToId: input.assignedToId,
          environment: input.environment,
          affectedUrl: input.affectedUrl,
          stackTrace: input.stackTrace,
          browserInfo: input.browserInfo,
        },
        include: {
          reportedBy: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          assignedTo: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // Log issue creation
      await this.auditService.log(tx, context, {
        action: 'CREATE',
        entity: 'Issue',
        entityId: newIssue.id,
        newValue: {
          title: newIssue.title,
          type: newIssue.type,
          priority: newIssue.priority,
          reportedBy: input.reportedById,
          assignedTo: input.assignedToId,
        },
      });

      return newIssue;
    });

    return issue;
  }

  /**
   * Update issue
   */
  async updateIssue(
    issueId: string,
    input: UpdateIssueInput,
    context: { userId: string; ipAddress?: string; userAgent?: string; requestId?: string }
  ) {
    const currentIssue = await this.prisma.issue.findUnique({
      where: { id: issueId },
    });

    if (!currentIssue) {
      throw new Error('Issue not found');
    }

    // If assigning to user, verify user exists
    if (input.assignedToId) {
      const assignedUser = await this.prisma.user.findUnique({
        where: { id: input.assignedToId },
      });

      if (!assignedUser) {
        throw new Error('Assigned user not found');
      }
    }

    const updatedIssue = await this.prisma.$transaction(async (tx) => {
      // If resolving, set resolvedAt timestamp
      const updateData: any = { ...input };
      if (input.status === 'RESOLVED' && currentIssue.status !== 'RESOLVED') {
        updateData.resolvedAt = new Date();
      }

      const updated = await tx.issue.update({
        where: { id: issueId },
        data: updateData,
        include: {
          reportedBy: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          assignedTo: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // Log update
      await this.auditService.log(tx, context, {
        action: 'UPDATE',
        entity: 'Issue',
        entityId: issueId,
        oldValue: {
          title: currentIssue.title,
          status: currentIssue.status,
          priority: currentIssue.priority,
          assignedTo: currentIssue.assignedToId,
        },
        newValue: {
          title: updated.title,
          status: updated.status,
          priority: updated.priority,
          assignedTo: updated.assignedToId,
          updatedBy: context.userId,
        },
      });

      return updated;
    });

    return updatedIssue;
  }

  /**
   * Delete issue
   */
  async deleteIssue(
    issueId: string,
    context: { userId: string; ipAddress?: string; userAgent?: string; requestId?: string }
  ) {
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
    });

    if (!issue) {
      throw new Error('Issue not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.issue.delete({
        where: { id: issueId },
      });

      // Log deletion
      await this.auditService.log(tx, context, {
        action: 'DELETE',
        entity: 'Issue',
        entityId: issueId,
        oldValue: {
          title: issue.title,
          type: issue.type,
          status: issue.status,
        },
        newValue: { deletedBy: context.userId },
      });
    });

    return { success: true, message: 'Issue deleted successfully' };
  }

  /**
   * Add comment to issue
   */
  async addComment(
    issueId: string,
    userId: string,
    comment: string,
    context: { userId: string; ipAddress?: string; userAgent?: string; requestId?: string }
  ) {
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
    });

    if (!issue) {
      throw new Error('Issue not found');
    }

    const issueComment = await this.prisma.$transaction(async (tx) => {
      const newComment = await tx.issueComment.create({
        data: {
          issueId,
          userId,
          comment,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      });

      // Log comment creation
      await this.auditService.log(tx, context, {
        action: 'CREATE',
        entity: 'IssueComment',
        entityId: newComment.id,
        newValue: {
          issueId,
          userId,
          commentPreview: comment.substring(0, 100),
        },
      });

      return newComment;
    });

    return issueComment;
  }

  /**
   * Get issue statistics
   */
  async getIssueStats() {
    const [
      total,
      openCount,
      inProgressCount,
      resolvedCount,
      closedCount,
      criticalCount,
      highCount,
      bugCount,
      featureCount,
    ] = await Promise.all([
      this.prisma.issue.count(),
      this.prisma.issue.count({ where: { status: 'OPEN' } }),
      this.prisma.issue.count({ where: { status: 'IN_PROGRESS' } }),
      this.prisma.issue.count({ where: { status: 'RESOLVED' } }),
      this.prisma.issue.count({ where: { status: 'CLOSED' } }),
      this.prisma.issue.count({ where: { priority: 'CRITICAL' } }),
      this.prisma.issue.count({ where: { priority: 'HIGH' } }),
      this.prisma.issue.count({ where: { type: 'BUG' } }),
      this.prisma.issue.count({ where: { type: 'FEATURE_REQUEST' } }),
    ]);

    return {
      total,
      byStatus: {
        open: openCount,
        inProgress: inProgressCount,
        resolved: resolvedCount,
        closed: closedCount,
      },
      byPriority: {
        critical: criticalCount,
        high: highCount,
      },
      byType: {
        bugs: bugCount,
        features: featureCount,
      },
    };
  }
}
