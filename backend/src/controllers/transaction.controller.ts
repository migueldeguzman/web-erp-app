import { Response, NextFunction } from 'express';
import { AppError, asyncHandler } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/database';
import { TransactionService } from '../services/transaction.service';
import { TransactionType, TransactionStatus } from '@prisma/client';

const transactionService = new TransactionService(prisma);

/**
 * Create a new journal voucher
 * POST /api/transactions
 */
export const createJournalEntry = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { companyId, date, description, reference, lines } = req.body;

    // Validate required fields
    if (!companyId || !date || !description || !lines || !Array.isArray(lines)) {
      throw new AppError(
        'Missing required fields: companyId, date, description, lines (array)',
        400
      );
    }

    // Validate at least 2 lines (minimum for double-entry)
    if (lines.length < 2) {
      throw new AppError('Transaction must have at least 2 lines', 400);
    }

    try {
      const result = await transactionService.createJournalEntry({
        companyId,
        date: new Date(date),
        description,
        reference,
        lines,
        createdById: req.user.id,
      });

      res.status(201).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new AppError(error.message, 400);
      }
      throw error;
    }
  }
);

/**
 * Post a draft transaction (make it permanent)
 * POST /api/transactions/:id/post
 */
export const postTransaction = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;

    try {
      const result = await transactionService.postTransaction({
        transactionId: id,
        userId: req.user.id,
      });

      res.json({
        status: 'success',
        data: result,
        message: `Transaction ${result.number} posted successfully`,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new AppError(error.message, 400);
      }
      throw error;
    }
  }
);

/**
 * Void a posted transaction (create reversal)
 * POST /api/transactions/:id/void
 */
export const voidTransaction = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      throw new AppError('Void reason is required', 400);
    }

    try {
      const result = await transactionService.voidTransaction({
        transactionId: id,
        userId: req.user.id,
        reason,
      });

      res.json({
        status: 'success',
        data: result,
        message: `Transaction ${result.voided.number} voided. Reversal ${result.reversal?.number} created.`,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new AppError(error.message, 400);
      }
      throw error;
    }
  }
);

/**
 * Get transaction by ID
 * GET /api/transactions/:id
 */
export const getTransaction = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;

    const transaction = await transactionService.getTransactionById(id);

    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }

    res.json({
      status: 'success',
      data: transaction,
    });
  }
);

/**
 * List transactions with filters and pagination
 * GET /api/transactions
 */
export const listTransactions = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const {
      companyId,
      type,
      status,
      startDate,
      endDate,
      page,
      limit,
    } = req.query;

    if (!companyId) {
      throw new AppError('companyId query parameter is required', 400);
    }

    const result = await transactionService.listTransactions({
      companyId: companyId as string,
      type: type as TransactionType | undefined,
      status: status as TransactionStatus | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json({
      status: 'success',
      data: result.transactions,
      pagination: result.pagination,
    });
  }
);

/**
 * Get account balance
 * GET /api/transactions/account-balance/:accountId
 */
export const getAccountBalance = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { accountId } = req.params;
    const { upToDate } = req.query;

    const balance = await transactionService.getAccountBalance(
      accountId,
      upToDate ? new Date(upToDate as string) : undefined
    );

    res.json({
      status: 'success',
      data: balance,
    });
  }
);
