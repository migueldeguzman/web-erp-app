import { Response, NextFunction } from 'express';
import { AppError, asyncHandler } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/database';
import { InvoiceService } from '../services/invoice.service';
import { InvoiceStatus } from '@prisma/client';

const invoiceService = new InvoiceService(prisma);

export const createInvoice = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const {
      companyId,
      customerId,
      invoiceDate,
      dueDate,
      items,
      taxRate,
      notes,
      revenueAccountId,
      receivableAccountId,
      taxAccountId,
    } = req.body;

    if (!companyId || !customerId || !invoiceDate || !dueDate || !items || !revenueAccountId || !receivableAccountId) {
      throw new AppError('Missing required fields', 400);
    }

    try {
      const result = await invoiceService.createInvoice({
        companyId,
        customerId,
        invoiceDate: new Date(invoiceDate),
        dueDate: new Date(dueDate),
        items,
        taxRate,
        notes,
        createdById: req.user.id,
        revenueAccountId,
        receivableAccountId,
        taxAccountId,
      });

      res.status(201).json({ status: 'success', data: result });
    } catch (error) {
      if (error instanceof Error) throw new AppError(error.message, 400);
      throw error;
    }
  }
);

export const postInvoice = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { id } = req.params;
    const { receivableAccountId, revenueAccountId, taxAccountId } = req.body;

    if (!receivableAccountId || !revenueAccountId) {
      throw new AppError('Missing required account IDs: receivableAccountId, revenueAccountId', 400);
    }

    try {
      const result = await invoiceService.postInvoice({
        invoiceId: id,
        userId: req.user.id,
        receivableAccountId,
        revenueAccountId,
        taxAccountId,
      });

      res.json({
        status: 'success',
        data: result,
        message: `Invoice ${result?.invoiceNumber} posted successfully`,
      });
    } catch (error) {
      if (error instanceof Error) throw new AppError(error.message, 400);
      throw error;
    }
  }
);

export const voidInvoice = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) throw new AppError('Void reason is required', 400);

    try {
      const result = await invoiceService.voidInvoice(id, req.user.id, reason);
      res.json({ status: 'success', data: result, message: 'Invoice voided successfully' });
    } catch (error) {
      if (error instanceof Error) throw new AppError(error.message, 400);
      throw error;
    }
  }
);

export const getInvoice = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { id } = req.params;
    const invoice = await invoiceService.getInvoiceById(id);

    if (!invoice) throw new AppError('Invoice not found', 404);

    res.json({ status: 'success', data: invoice });
  }
);

export const listInvoices = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { companyId, customerId, status, startDate, endDate, overdue, page, limit } = req.query;

    if (!companyId) throw new AppError('companyId query parameter is required', 400);

    const result = await invoiceService.listInvoices({
      companyId: companyId as string,
      customerId: customerId as string | undefined,
      status: status as InvoiceStatus | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      overdue: overdue === 'true',
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json({ status: 'success', data: result.invoices, pagination: result.pagination });
  }
);
