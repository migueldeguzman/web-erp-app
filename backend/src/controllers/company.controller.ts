import { Response, NextFunction } from 'express';
import { AppError, asyncHandler } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/database';
import { AuditService } from '../services/audit.service';

const auditService = new AuditService(prisma);

/**
 * Create a new company
 * POST /api/companies
 */
export const createCompany = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { code, name, address, phone, email, taxNumber } = req.body;

    // Validate required fields
    if (!code || !name) {
      throw new AppError('Missing required fields: code, name', 400);
    }

    // Check if company code already exists
    const existing = await prisma.company.findUnique({
      where: { code },
    });

    if (existing) {
      throw new AppError(`Company with code '${code}' already exists`, 409);
    }

    // Create company with audit log in transaction
    const company = await prisma.$transaction(async (tx) => {
      const newCompany = await tx.company.create({
        data: {
          code,
          name,
          address,
          phone,
          email,
          taxNumber,
          isActive: true,
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
          entity: 'Company',
          entityId: newCompany.id,
          newValue: {
            code: newCompany.code,
            name: newCompany.name,
            address: newCompany.address,
            phone: newCompany.phone,
            email: newCompany.email,
            taxNumber: newCompany.taxNumber,
            isActive: newCompany.isActive,
          },
        }
      );

      return newCompany;
    });

    res.status(201).json({
      status: 'success',
      data: company,
      message: `Company '${company.name}' created successfully`,
    });
  }
);

/**
 * Get all companies
 * GET /api/companies
 */
export const listCompanies = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { isActive } = req.query;

    const where: any = {};
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const companies = await prisma.company.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        address: true,
        phone: true,
        email: true,
        taxNumber: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            accounts: true,
            invoices: true,
            payments: true,
            customers: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({
      status: 'success',
      data: companies,
      message: `Retrieved ${companies.length} companies`,
    });
  }
);

/**
 * Get a single company by ID
 * GET /api/companies/:id
 */
export const getCompany = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;

    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            accounts: true,
            invoices: true,
            payments: true,
            transactions: true,
            customers: true,
          },
        },
      },
    });

    if (!company) {
      throw new AppError('Company not found', 404);
    }

    res.json({
      status: 'success',
      data: company,
    });
  }
);

/**
 * Update a company
 * PUT /api/companies/:id
 */
export const updateCompany = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;
    const { code, name, address, phone, email, taxNumber, isActive } = req.body;

    // Check if company exists
    const existing = await prisma.company.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new AppError('Company not found', 404);
    }

    // If code is being changed, check for duplicates
    if (code && code !== existing.code) {
      const duplicate = await prisma.company.findUnique({
        where: { code },
      });

      if (duplicate) {
        throw new AppError(`Company with code '${code}' already exists`, 409);
      }
    }

    // Update company with audit log in transaction
    const company = await prisma.$transaction(async (tx) => {
      const updatedCompany = await tx.company.update({
        where: { id },
        data: {
          ...(code && { code }),
          ...(name && { name }),
          ...(address !== undefined && { address }),
          ...(phone !== undefined && { phone }),
          ...(email !== undefined && { email }),
          ...(taxNumber !== undefined && { taxNumber }),
          ...(isActive !== undefined && { isActive }),
        },
      });

      // Calculate changes for efficient audit log
      const changes = auditService.calculateChanges(existing, updatedCompany);

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
          entity: 'Company',
          entityId: updatedCompany.id,
          oldValue: changes.old,
          newValue: changes.new,
        }
      );

      return updatedCompany;
    });

    res.json({
      status: 'success',
      data: company,
      message: `Company '${company.name}' updated successfully`,
    });
  }
);

/**
 * Delete (deactivate) a company
 * DELETE /api/companies/:id
 */
export const deleteCompany = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const { id } = req.params;

    // Check if company exists
    const existing = await prisma.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            accounts: true,
            invoices: true,
            payments: true,
            transactions: true,
          },
        },
      },
    });

    if (!existing) {
      throw new AppError('Company not found', 404);
    }

    // Check if company has any data (prevent deletion if has transactions)
    const hasData =
      existing._count.invoices > 0 ||
      existing._count.payments > 0 ||
      existing._count.transactions > 0;

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
          entity: 'Company',
          entityId: id,
          reason: 'has_transactions',
          errorDetails: {
            companyCode: existing.code,
            companyName: existing.name,
            invoiceCount: existing._count.invoices,
            paymentCount: existing._count.payments,
            transactionCount: existing._count.transactions,
          },
        }
      );

      throw new AppError(
        'Cannot delete company with existing transactions. Deactivate instead.',
        400
      );
    }

    // Soft delete by setting isActive = false with audit log in transaction
    const company = await prisma.$transaction(async (tx) => {
      const deactivatedCompany = await tx.company.update({
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
          entity: 'Company',
          entityId: deactivatedCompany.id,
          oldValue: {
            isActive: true,
            name: deactivatedCompany.name,
            code: deactivatedCompany.code,
          },
          newValue: {
            isActive: false,
            reason: 'Soft delete (deactivation)',
            name: deactivatedCompany.name,
            code: deactivatedCompany.code,
          },
        }
      );

      return deactivatedCompany;
    });

    res.json({
      status: 'success',
      data: company,
      message: `Company '${company.name}' has been deactivated`,
    });
  }
);
