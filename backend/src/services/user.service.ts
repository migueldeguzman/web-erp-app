import { PrismaClient, UserRole, Prisma } from '@prisma/client';
import { hashPassword } from '../utils/password.util';
import { AuditService } from './audit.service';

export interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface UpdateUserInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface UserFilters {
  role?: UserRole;
  isActive?: boolean;
  search?: string; // Search by email, firstName, or lastName
}

export class UserService {
  constructor(
    private prisma: PrismaClient,
    private auditService: AuditService
  ) {}

  /**
   * Get paginated list of users with optional filters
   */
  async listUsers(
    page: number = 1,
    limit: number = 10,
    filters: UserFilters = {}
  ) {
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.UserWhereInput = {};

    if (filters.role) {
      where.role = filters.role;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.search) {
      where.OR = [
        { email: { contains: filters.search, mode: 'insensitive' } },
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Get total count and users
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              createdInvoices: true,
              createdPayments: true,
              createdTransactions: true,
              auditLogs: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single user by ID with detailed information
   */
  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            createdInvoices: true,
            createdPayments: true,
            createdTransactions: true,
            auditLogs: true,
            blacklistedTokens: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  /**
   * Create new user (ADMIN only operation)
   */
  async createUser(
    input: CreateUserInput,
    context: { userId: string; ipAddress?: string; userAgent?: string; requestId?: string }
  ) {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      // Log failed attempt
      await this.auditService.logFailureStandalone(context, {
        action: 'CREATE',
        entity: 'User',
        entityId: input.email,
        reason: 'user_already_exists',
        errorDetails: { email: input.email },
      });

      throw new Error('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await hashPassword(input.password);

    // Create user with audit log in transaction
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: input.email,
          password: hashedPassword,
          firstName: input.firstName,
          lastName: input.lastName,
          role: input.role,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });

      // Log successful creation
      await this.auditService.log(tx, context, {
        action: 'CREATE',
        entity: 'User',
        entityId: newUser.id,
        newValue: {
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role,
          createdBy: context.userId,
        },
      });

      return newUser;
    });

    return user;
  }

  /**
   * Update user details
   */
  async updateUser(
    userId: string,
    input: UpdateUserInput,
    context: { userId: string; ipAddress?: string; userAgent?: string; requestId?: string }
  ) {
    // Get current user data
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!currentUser) {
      throw new Error('User not found');
    }

    // If updating email, check for duplicates
    if (input.email && input.email !== currentUser.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: input.email },
      });

      if (existingUser) {
        throw new Error('User with this email already exists');
      }
    }

    // Update user with audit log in transaction
    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: input,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Log update
      await this.auditService.log(tx, context, {
        action: 'UPDATE',
        entity: 'User',
        entityId: userId,
        oldValue: {
          email: currentUser.email,
          firstName: currentUser.firstName,
          lastName: currentUser.lastName,
          role: currentUser.role,
          isActive: currentUser.isActive,
        },
        newValue: {
          email: updated.email,
          firstName: updated.firstName,
          lastName: updated.lastName,
          role: updated.role,
          isActive: updated.isActive,
          updatedBy: context.userId,
        },
      });

      return updated;
    });

    return updatedUser;
  }

  /**
   * Deactivate user (soft delete)
   */
  async deactivateUser(
    userId: string,
    context: { userId: string; ipAddress?: string; userAgent?: string; requestId?: string }
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.isActive) {
      throw new Error('User is already deactivated');
    }

    // Deactivate user and blacklist all their tokens
    await this.prisma.$transaction(async (tx) => {
      // Update user status
      await tx.user.update({
        where: { id: userId },
        data: { isActive: false },
      });

      // Blacklist all active tokens for this user (if they have any active sessions)
      // Note: We can't blacklist tokens we don't know about, but the auth middleware
      // will catch deactivated users and blacklist their token when they try to use it

      // Log deactivation
      await this.auditService.log(tx, context, {
        action: 'UPDATE',
        entity: 'User',
        entityId: userId,
        oldValue: { isActive: true },
        newValue: { isActive: false, deactivatedBy: context.userId },
      });
    });

    return { success: true, message: 'User deactivated successfully' };
  }

  /**
   * Reactivate user
   */
  async reactivateUser(
    userId: string,
    context: { userId: string; ipAddress?: string; userAgent?: string; requestId?: string }
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.isActive) {
      throw new Error('User is already active');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { isActive: true },
      });

      // Log reactivation
      await this.auditService.log(tx, context, {
        action: 'UPDATE',
        entity: 'User',
        entityId: userId,
        oldValue: { isActive: false },
        newValue: { isActive: true, reactivatedBy: context.userId },
      });
    });

    return { success: true, message: 'User reactivated successfully' };
  }

  /**
   * Delete user permanently (hard delete - use with caution)
   */
  async deleteUser(
    userId: string,
    context: { userId: string; ipAddress?: string; userAgent?: string; requestId?: string }
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            createdInvoices: true,
            createdPayments: true,
            createdTransactions: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Prevent deletion of users with created records (data integrity)
    const hasRecords =
      user._count.createdInvoices > 0 ||
      user._count.createdPayments > 0 ||
      user._count.createdTransactions > 0;

    if (hasRecords) {
      throw new Error(
        'Cannot delete user with existing records. Please deactivate instead.'
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Delete user
      await tx.user.delete({
        where: { id: userId },
      });

      // Log deletion
      await this.auditService.log(tx, context, {
        action: 'DELETE',
        entity: 'User',
        entityId: userId,
        oldValue: {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        newValue: { deletedBy: context.userId },
      });
    });

    return { success: true, message: 'User deleted successfully' };
  }

  /**
   * Get user activity logs
   */
  async getUserActivity(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({
        where: { userId },
      }),
      this.prisma.auditLog.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          oldValue: true,
          newValue: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            createdInvoices: true,
            createdPayments: true,
            createdTransactions: true,
            auditLogs: true,
            blacklistedTokens: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Get last login
    const lastLogin = await this.prisma.auditLog.findFirst({
      where: {
        userId,
        action: 'LOGIN',
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, ipAddress: true },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
      statistics: {
        invoicesCreated: user._count.createdInvoices,
        paymentsCreated: user._count.createdPayments,
        transactionsCreated: user._count.createdTransactions,
        auditLogEntries: user._count.auditLogs,
        blacklistedTokens: user._count.blacklistedTokens,
      },
      lastLogin: lastLogin
        ? {
            timestamp: lastLogin.createdAt,
            ipAddress: lastLogin.ipAddress,
          }
        : null,
    };
  }
}
