import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

/**
 * Internal routes for team dashboards
 * No JWT authentication required - for internal use only
 *
 * Security: These routes should be restricted by:
 * - Network firewall (allow only internal IPs)
 * - Or add API key authentication
 */

/**
 * GET /api/internal/bookings
 * Get all bookings with filters
 * Query params: companyId?, status?, page?, limit?
 */
router.get('/bookings', async (req, res) => {
  try {
    const { companyId, status, page = '1', limit = '50' } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (companyId) {
      where.companyId = companyId as string;
    }

    if (status) {
      where.status = status as string;
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              plateNumber: true,
              vin: true,
            },
          },
          company: {
            select: {
              id: true,
              name: true,
            },
          },
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              totalAmount: true,
              paidAmount: true,
              balanceAmount: true,
              status: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limitNum,
      }),
      prisma.booking.count({ where }),
    ]);

    res.json({
      success: true,
      data: bookings,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings',
      error: error.message,
    });
  }
});

/**
 * GET /api/internal/bookings/:id
 * Get booking details by ID
 */
router.get('/bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        customer: true,
        vehicle: true,
        company: true,
        invoice: true,
        addOns: true,
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    res.json({
      success: true,
      data: booking,
    });
  } catch (error: any) {
    console.error('Error fetching booking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking',
      error: error.message,
    });
  }
});

/**
 * GET /api/internal/transactions
 * Get all transactions/journal entries
 * Query params: companyId?, type?, status?, startDate?, endDate?, page?, limit?
 */
router.get('/transactions', async (req, res) => {
  try {
    const {
      companyId,
      type,
      status,
      startDate,
      endDate,
      page = '1',
      limit = '50'
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (companyId) {
      where.companyId = companyId as string;
    }

    if (type) {
      where.type = type as string;
    }

    if (status) {
      where.status = status as string;
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        where.date.gte = new Date(startDate as string);
      }
      if (endDate) {
        where.date.lte = new Date(endDate as string);
      }
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          company: {
            select: {
              id: true,
              name: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          lines: {
            include: {
              account: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  type: true,
                },
              },
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
        orderBy: {
          date: 'desc',
        },
        skip,
        take: limitNum,
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({
      success: true,
      data: transactions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
      error: error.message,
    });
  }
});

/**
 * GET /api/internal/transactions/:id
 * Get transaction details by ID
 */
router.get('/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: {
        company: true,
        createdBy: true,
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    res.json({
      success: true,
      data: transaction,
    });
  } catch (error: any) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction',
      error: error.message,
    });
  }
});

/**
 * GET /api/internal/invoices
 * Get all invoices
 * Query params: companyId?, status?, startDate?, endDate?, page?, limit?
 */
router.get('/invoices', async (req, res) => {
  try {
    const {
      companyId,
      status,
      startDate,
      endDate,
      page = '1',
      limit = '50'
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (companyId) {
      where.companyId = companyId as string;
    }

    if (status) {
      where.status = status as string;
    }

    if (startDate || endDate) {
      where.invoiceDate = {};
      if (startDate) {
        where.invoiceDate.gte = new Date(startDate as string);
      }
      if (endDate) {
        where.invoiceDate.lte = new Date(endDate as string);
      }
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          company: {
            select: {
              id: true,
              name: true,
            },
          },
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          items: {
            include: {
              account: {
                select: {
                  code: true,
                  name: true,
                },
              },
            },
          },
          transaction: {
            select: {
              id: true,
              number: true,
              status: true,
            },
          },
        },
        orderBy: {
          invoiceDate: 'desc',
        },
        skip,
        take: limitNum,
      }),
      prisma.invoice.count({ where }),
    ]);

    res.json({
      success: true,
      data: invoices,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoices',
      error: error.message,
    });
  }
});

/**
 * GET /api/internal/companies
 * Get all companies (for filtering)
 */
router.get('/companies', async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    res.json({
      success: true,
      data: companies,
    });
  } catch (error: any) {
    console.error('Error fetching companies:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch companies',
      error: error.message,
    });
  }
});

export default router;
