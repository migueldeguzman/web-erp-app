import { Response, NextFunction } from 'express';
import { AppError, asyncHandler } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/database';
import { PaymentService } from '../services/payment.service';
import { PaymentStatus, PaymentMethod } from '@prisma/client';

const paymentService = new PaymentService(prisma);

export const createPayment = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const {
      companyId,
      customerId,
      invoiceId,
      paymentDate,
      amount,
      method,
      reference,
      notes,
      cashAccountId,
      receivableAccountId,
    } = req.body;

    if (!companyId || !paymentDate || !amount || !method || !cashAccountId || !receivableAccountId) {
      throw new AppError('Missing required fields', 400);
    }

    try {
      const result = await paymentService.createPayment({
        companyId,
        customerId,
        invoiceId,
        paymentDate: new Date(paymentDate),
        amount,
        method: method as PaymentMethod,
        reference,
        notes,
        createdById: req.user.id,
        cashAccountId,
        receivableAccountId,
      });

      res.status(201).json({ status: 'success', data: result });
    } catch (error) {
      if (error instanceof Error) throw new AppError(error.message, 400);
      throw error;
    }
  }
);

export const postPayment = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { id } = req.params;
    const { cashAccountId, receivableAccountId } = req.body;

    if (!cashAccountId || !receivableAccountId) {
      throw new AppError('Missing required account IDs: cashAccountId, receivableAccountId', 400);
    }

    try {
      const result = await paymentService.postPayment({
        paymentId: id,
        userId: req.user.id,
        cashAccountId,
        receivableAccountId,
      });

      res.json({
        status: 'success',
        data: result,
        message: `Payment ${result?.paymentNumber} posted successfully`,
      });
    } catch (error) {
      if (error instanceof Error) throw new AppError(error.message, 400);
      throw error;
    }
  }
);

export const voidPayment = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) throw new AppError('Void reason is required', 400);

    try {
      const result = await paymentService.voidPayment(id, req.user.id, reason);
      res.json({ status: 'success', data: result, message: 'Payment voided successfully' });
    } catch (error) {
      if (error instanceof Error) throw new AppError(error.message, 400);
      throw error;
    }
  }
);

export const getPayment = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { id } = req.params;
    const payment = await paymentService.getPaymentById(id);

    if (!payment) throw new AppError('Payment not found', 404);

    res.json({ status: 'success', data: payment });
  }
);

export const listPayments = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const { companyId, customerId, invoiceId, status, method, startDate, endDate, page, limit } = req.query;

    if (!companyId) throw new AppError('companyId query parameter is required', 400);

    const result = await paymentService.listPayments({
      companyId: companyId as string,
      customerId: customerId as string | undefined,
      invoiceId: invoiceId as string | undefined,
      status: status as PaymentStatus | undefined,
      method: method as PaymentMethod | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json({ status: 'success', data: result.payments, pagination: result.pagination });
  }
);
