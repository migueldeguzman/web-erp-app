import { Response, NextFunction } from 'express';
import { AppError, asyncHandler } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/database';
import { AccountType, AccountSubType, Prisma } from '@prisma/client';
import { AuditService } from '../services/audit.service';

const auditService = new AuditService(prisma);

/**
 * Create a new account
 * POST /api/accounts
 */
export const createAccount = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { companyId, code, name, type, subType, description, parentId } = req.body;

    // Validate required fields
    if (!companyId || !code || !name || !type || !subType) {
      throw new AppError(
        'Missing required fields: companyId, code, name, type, subType',
        400
      );
    }

    // Check if account code already exists for this company
    const existing = await prisma.account.findUnique({
      where: {
        companyId_code: {
          companyId,
          code,
        },
      },
    });

    if (existing) {
      throw new AppError(`Account with code '${code}' already exists for this company`, 400);
    }

    // If parentId provided, verify it exists and belongs to same company
    if (parentId) {
      const parent = await prisma.account.findUnique({
        where: { id: parentId },
      });

      if (!parent) {
        throw new AppError('Parent account not found', 404);
      }

      if (parent.companyId !== companyId) {
        throw new AppError('Parent account must belong to the same company', 400);
      }
    }

    // Create account with audit log in transaction
    const account = await prisma.$transaction(async (tx) => {
      const newAccount = await tx.account.create({
        data: {
          companyId,
          code,
          name,
          type: type as AccountType,
          subType: subType as AccountSubType,
          description,
          parentId,
        },
        include: {
          company: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          parent: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      });

      // Audit log within same transaction
      await auditService.log(
        tx,
        {
          userId: req.user!.id,
          ipAddress: req.auditContext?.ipAddress,
          userAgent: req.auditContext?.userAgent,
          requestId: req.auditContext?.requestId,
        },
        {
          action: 'CREATE',
          entity: 'Account',
          entityId: newAccount.id,
          newValue: {
            code: newAccount.code,
            name: newAccount.name,
            type: newAccount.type,
            subType: newAccount.subType,
          },
        }
      );

      return newAccount;
    });

    res.status(201).json({
      status: 'success',
      data: account,
    });
  }
);

/**
 * Get account by ID
 * GET /api/accounts/:id
 */
export const getAccount = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;
    const { includeBalance } = req.query;

    const account = await prisma.account.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        parent: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        children: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            isActive: true,
          },
        },
      },
    });

    if (!account) {
      throw new AppError('Account not found', 404);
    }

    // Optionally include balance calculation
    let balance;
    if (includeBalance === 'true') {
      const lines = await prisma.transactionLine.findMany({
        where: {
          accountId: id,
          transaction: {
            status: 'POSTED',
          },
        },
        select: {
          debit: true,
          credit: true,
        },
      });

      const totals = lines.reduce(
        (acc, line) => ({
          debit: acc.debit + Number(line.debit),
          credit: acc.credit + Number(line.credit),
        }),
        { debit: 0, credit: 0 }
      );

      balance = {
        debit: totals.debit,
        credit: totals.credit,
        balance: totals.debit - totals.credit,
      };
    }

    res.json({
      status: 'success',
      data: {
        account,
        ...(balance && { balance }),
      },
    });
  }
);

/**
 * List accounts with filters and pagination
 * GET /api/accounts
 */
export const listAccounts = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const {
      companyId,
      type,
      subType,
      isActive,
      parentId,
      search,
      page,
      limit,
    } = req.query;

    if (!companyId) {
      throw new AppError('companyId query parameter is required', 400);
    }

    const pageNum = page ? parseInt(page as string) : 1;
    const limitNum = limit ? parseInt(limit as string) : 50;
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.AccountWhereInput = {
      companyId: companyId as string,
      ...(type && { type: type as AccountType }),
      ...(subType && { subType: subType as AccountSubType }),
      ...(isActive !== undefined && { isActive: isActive === 'true' }),
      ...(parentId && { parentId: parentId as string }),
      ...(search && {
        OR: [
          { code: { contains: search as string, mode: 'insensitive' } },
          { name: { contains: search as string, mode: 'insensitive' } },
        ],
      }),
    };

    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        where,
        include: {
          parent: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          _count: {
            select: {
              children: true,
              transactionLines: true,
            },
          },
        },
        orderBy: [{ code: 'asc' }],
        skip,
        take: limitNum,
      }),
      prisma.account.count({ where }),
    ]);

    res.json({
      status: 'success',
      data: accounts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  }
);

/**
 * Update account
 * PATCH /api/accounts/:id
 */
export const updateAccount = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;
    const { name, description, parentId, isActive } = req.body;

    // Get existing account
    const existing = await prisma.account.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new AppError('Account not found', 404);
    }

    // Check if account has posted transactions (cannot change critical fields)
    const hasPostedTransactions = await prisma.transactionLine.findFirst({
      where: {
        accountId: id,
        transaction: {
          status: 'POSTED',
        },
      },
    });

    if (hasPostedTransactions && (req.body.code || req.body.type || req.body.subType)) {
      throw new AppError(
        'Cannot change code, type, or subType for accounts with posted transactions',
        400
      );
    }

    // If changing parent, verify new parent exists and belongs to same company
    if (parentId && parentId !== existing.parentId) {
      if (parentId === id) {
        throw new AppError('Account cannot be its own parent', 400);
      }

      const newParent = await prisma.account.findUnique({
        where: { id: parentId },
      });

      if (!newParent) {
        throw new AppError('Parent account not found', 404);
      }

      if (newParent.companyId !== existing.companyId) {
        throw new AppError('Parent account must belong to the same company', 400);
      }
    }

    // Update account with audit log in transaction
    const updated = await prisma.$transaction(async (tx) => {
      const updatedAccount = await tx.account.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(parentId !== undefined && { parentId }),
          ...(isActive !== undefined && { isActive }),
        },
        include: {
          company: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          parent: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      });

      // Calculate changes for efficient audit log
      const changes = auditService.calculateChanges(existing, updatedAccount);

      // Audit log within same transaction
      await auditService.log(
        tx,
        {
          userId: req.user!.id,
          ipAddress: req.auditContext?.ipAddress,
          userAgent: req.auditContext?.userAgent,
          requestId: req.auditContext?.requestId,
        },
        {
          action: 'UPDATE',
          entity: 'Account',
          entityId: id,
          oldValue: changes.old,
          newValue: changes.new,
        }
      );

      return updatedAccount;
    });

    res.json({
      status: 'success',
      data: updated,
    });
  }
);

/**
 * Deactivate account (soft delete)
 * DELETE /api/accounts/:id
 */
export const deactivateAccount = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;

    const account = await prisma.account.findUnique({
      where: { id },
      include: {
        children: true,
      },
    });

    if (!account) {
      throw new AppError('Account not found', 404);
    }

    if (!account.isActive) {
      throw new AppError('Account is already inactive', 400);
    }

    // Check if account has active children
    const activeChildren = account.children.filter((child) => child.isActive);
    if (activeChildren.length > 0) {
      // Log failed deletion attempt (standalone - not in transaction since operation fails)
      await auditService.logFailureStandalone(
        {
          userId: req.user.id,
          ipAddress: req.auditContext?.ipAddress,
          userAgent: req.auditContext?.userAgent,
          requestId: req.auditContext?.requestId,
        },
        {
          action: 'DELETE',
          entity: 'Account',
          entityId: id,
          reason: 'has_active_children',
          errorDetails: {
            accountCode: account.code,
            accountName: account.name,
            activeChildrenCount: activeChildren.length,
          },
        }
      );

      throw new AppError(
        'Cannot deactivate account with active child accounts. Deactivate children first.',
        400
      );
    }

    // Check if account has draft or posted transactions
    const transactionCount = await prisma.transactionLine.count({
      where: {
        accountId: id,
        transaction: {
          status: { in: ['DRAFT', 'POSTED'] },
        },
      },
    });

    if (transactionCount > 0) {
      // Log failed deletion attempt
      await auditService.logFailureStandalone(
        {
          userId: req.user.id,
          ipAddress: req.auditContext?.ipAddress,
          userAgent: req.auditContext?.userAgent,
          requestId: req.auditContext?.requestId,
        },
        {
          action: 'DELETE',
          entity: 'Account',
          entityId: id,
          reason: 'has_transactions',
          errorDetails: {
            accountCode: account.code,
            accountName: account.name,
            transactionCount: transactionCount,
          },
        }
      );

      throw new AppError(
        'Cannot deactivate account with existing transactions. Create a new account instead.',
        400
      );
    }

    // Deactivate account with audit log in transaction
    const deactivated = await prisma.$transaction(async (tx) => {
      const deactivatedAccount = await tx.account.update({
        where: { id },
        data: { isActive: false },
      });

      // Audit log within same transaction
      await auditService.log(
        tx,
        {
          userId: req.user!.id,
          ipAddress: req.auditContext?.ipAddress,
          userAgent: req.auditContext?.userAgent,
          requestId: req.auditContext?.requestId,
        },
        {
          action: 'DELETE',
          entity: 'Account',
          entityId: id,
          oldValue: { isActive: true, code: account.code, name: account.name },
          newValue: { isActive: false },
        }
      );

      return deactivatedAccount;
    });

    res.json({
      status: 'success',
      data: deactivated,
      message: 'Account deactivated successfully',
    });
  }
);

/**
 * Get chart of accounts (hierarchical tree)
 * GET /api/accounts/chart-of-accounts
 */
export const getChartOfAccounts = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { companyId } = req.query;

    if (!companyId) {
      throw new AppError('companyId query parameter is required', 400);
    }

    // Get all accounts for the company
    const accounts = await prisma.account.findMany({
      where: {
        companyId: companyId as string,
        isActive: true,
      },
      include: {
        parent: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        children: {
          where: { isActive: true },
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            subType: true,
          },
        },
      },
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
    });

    // Build hierarchical structure
    const accountMap = new Map(accounts.map((acc) => [acc.id, { ...acc, children: [] as any[] }]));
    const rootAccounts: any[] = [];

    accounts.forEach((account) => {
      const accountWithChildren = accountMap.get(account.id);
      if (!accountWithChildren) return;

      if (!account.parentId) {
        rootAccounts.push(accountWithChildren);
      } else {
        const parent = accountMap.get(account.parentId);
        if (parent) {
          parent.children.push(accountWithChildren);
        }
      }
    });

    // Group by account type
    const chartOfAccounts = {
      ASSET: rootAccounts.filter((acc) => acc.type === 'ASSET'),
      LIABILITY: rootAccounts.filter((acc) => acc.type === 'LIABILITY'),
      EQUITY: rootAccounts.filter((acc) => acc.type === 'EQUITY'),
      REVENUE: rootAccounts.filter((acc) => acc.type === 'REVENUE'),
      EXPENSE: rootAccounts.filter((acc) => acc.type === 'EXPENSE'),
    };

    res.json({
      status: 'success',
      data: chartOfAccounts,
    });
  }
);
