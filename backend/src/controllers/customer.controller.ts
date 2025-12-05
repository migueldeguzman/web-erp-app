import { Response, NextFunction } from 'express';
import { AppError, asyncHandler } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/database';
import { AuditService } from '../services/audit.service';

const auditService = new AuditService(prisma);

/**
 * Create a new customer
 * POST /api/customers
 */
export const createCustomer = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { companyId, code, name, email, phone, address, taxNumber } = req.body;

    // Validate required fields
    if (!companyId || !code || !name) {
      throw new AppError('Missing required fields: companyId, code, name', 400);
    }

    // Verify company exists
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new AppError('Company not found', 404);
    }

    // Check if customer code already exists for this company
    const existing = await prisma.customer.findUnique({
      where: {
        companyId_code: {
          companyId,
          code,
        },
      },
    });

    if (existing) {
      throw new AppError(
        `Customer with code '${code}' already exists for company '${company.name}'`,
        409
      );
    }

    // Create customer with audit log in transaction
    const customer = await prisma.$transaction(async (tx) => {
      const newCustomer = await tx.customer.create({
        data: {
          companyId,
          code,
          name,
          email,
          phone,
          address,
          taxNumber,
          isActive: true,
        },
        include: {
          company: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      });

      // Create audit log with AuditService
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
          entity: 'Customer',
          entityId: newCustomer.id,
          newValue: {
            code: newCustomer.code,
            name: newCustomer.name,
            companyId: newCustomer.companyId,
            email: newCustomer.email,
            phone: newCustomer.phone,
            address: newCustomer.address,
            taxNumber: newCustomer.taxNumber,
            isActive: newCustomer.isActive,
          },
        }
      );

      return newCustomer;
    });

    res.status(201).json({
      status: 'success',
      data: customer,
      message: `Customer '${customer.name}' created successfully`,
    });
  }
);

/**
 * Get all customers for a company
 * GET /api/customers?companyId=xxx
 */
export const listCustomers = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { companyId, isActive, search } = req.query;

    if (!companyId) {
      throw new AppError('companyId query parameter is required', 400);
    }

    const where: any = {
      companyId: companyId as string,
    };

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { code: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const customers = await prisma.customer.findMany({
      where,
      include: {
        company: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        _count: {
          select: {
            invoices: true,
            payments: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({
      status: 'success',
      data: customers,
      message: `Retrieved ${customers.length} customers`,
    });
  }
);

/**
 * Get a single customer by ID
 * GET /api/customers/:id
 */
export const getCustomer = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        _count: {
          select: {
            invoices: true,
            payments: true,
          },
        },
      },
    });

    if (!customer) {
      throw new AppError('Customer not found', 404);
    }

    res.json({
      status: 'success',
      data: customer,
    });
  }
);

/**
 * Update a customer
 * PUT /api/customers/:id
 */
export const updateCustomer = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;
    const { code, name, email, phone, address, taxNumber, isActive } = req.body;

    // Check if customer exists
    const existing = await prisma.customer.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new AppError('Customer not found', 404);
    }

    // If code is being changed, check for duplicates
    if (code && code !== existing.code) {
      const duplicate = await prisma.customer.findUnique({
        where: {
          companyId_code: {
            companyId: existing.companyId,
            code,
          },
        },
      });

      if (duplicate) {
        throw new AppError(
          `Customer with code '${code}' already exists for this company`,
          409
        );
      }
    }

    // Update customer with audit log in transaction
    const customer = await prisma.$transaction(async (tx) => {
      const updatedCustomer = await tx.customer.update({
        where: { id },
        data: {
          ...(code && { code }),
          ...(name && { name }),
          ...(email !== undefined && { email }),
          ...(phone !== undefined && { phone }),
          ...(address !== undefined && { address }),
          ...(taxNumber !== undefined && { taxNumber }),
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
        },
      });

      // Calculate changes for efficient audit log
      const changes = auditService.calculateChanges(existing, updatedCustomer);

      // Create audit log with AuditService
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
          entity: 'Customer',
          entityId: updatedCustomer.id,
          oldValue: changes.old,
          newValue: changes.new,
        }
      );

      return updatedCustomer;
    });

    res.json({
      status: 'success',
      data: customer,
      message: `Customer '${customer.name}' updated successfully`,
    });
  }
);

/**
 * Delete (deactivate) a customer
 * DELETE /api/customers/:id
 */
export const deleteCustomer = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;

    // Check if customer exists
    const existing = await prisma.customer.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            invoices: true,
            payments: true,
          },
        },
      },
    });

    if (!existing) {
      throw new AppError('Customer not found', 404);
    }

    // Check if customer has any data (prevent deletion if has transactions)
    const hasData = existing._count.invoices > 0 || existing._count.payments > 0;

    if (hasData) {
      // Log failed deletion attempt (standalone - operation fails)
      await auditService.logFailureStandalone(
        {
          userId: req.user!.id,
          ipAddress: req.auditContext?.ipAddress,
          userAgent: req.auditContext?.userAgent,
          requestId: req.auditContext?.requestId,
        },
        {
          action: 'DELETE',
          entity: 'Customer',
          entityId: id,
          reason: 'has_transactions',
          errorDetails: {
            customerCode: existing.code,
            customerName: existing.name,
            invoiceCount: existing._count.invoices,
            paymentCount: existing._count.payments,
          },
        }
      );

      throw new AppError(
        'Cannot delete customer with existing invoices or payments. Deactivate instead.',
        400
      );
    }

    // Soft delete by setting isActive = false with audit log in transaction
    const customer = await prisma.$transaction(async (tx) => {
      const deactivatedCustomer = await tx.customer.update({
        where: { id },
        data: { isActive: false },
      });

      // Create audit log with AuditService
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
          entity: 'Customer',
          entityId: deactivatedCustomer.id,
          oldValue: {
            isActive: true,
            name: deactivatedCustomer.name,
            code: deactivatedCustomer.code,
          },
          newValue: {
            isActive: false,
            reason: 'Soft delete (deactivation)',
            name: deactivatedCustomer.name,
            code: deactivatedCustomer.code,
          },
        }
      );

      return deactivatedCustomer;
    });

    res.json({
      status: 'success',
      data: customer,
      message: `Customer '${customer.name}' has been deactivated`,
    });
  }
);
