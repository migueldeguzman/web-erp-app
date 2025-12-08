import { PrismaClient, Prisma, AuditAction } from '@prisma/client';

export interface AdminDashboardStats {
  users: {
    total: number;
    active: number;
    inactive: number;
    byRole: {
      ADMIN: number;
      ACCOUNTANT: number;
      MANAGER: number;
      VIEWER: number;
    };
  };
  companies: {
    total: number;
    active: number;
  };
  customers: {
    total: number;
    active: number;
    kycVerified: number;
  };
  accounting: {
    totalTransactions: number;
    postedTransactions: number;
    draftTransactions: number;
    totalInvoices: number;
    totalPayments: number;
  };
  rental: {
    totalVehicles: number;
    availableVehicles: number;
    rentedVehicles: number;
    totalBookings: number;
    activeBookings: number;
  };
  audit: {
    totalLogs: number;
    todayLogs: number;
    failedLogins: number;
  };
}

export interface AuditLogFilters {
  userId?: string;
  action?: AuditAction;
  entity?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
}

export interface SystemHealth {
  database: {
    connected: boolean;
    responseTime: number; // in ms
  };
  tables: {
    users: number;
    companies: number;
    transactions: number;
    invoices: number;
    payments: number;
    vehicles: number;
    bookings: number;
    auditLogs: number;
  };
  lastBackup?: Date;
  diskUsage?: {
    used: number;
    total: number;
    percentage: number;
  };
}

export class AdminService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get comprehensive dashboard statistics
   */
  async getDashboardStats(): Promise<AdminDashboardStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      // User stats
      totalUsers,
      activeUsers,
      adminCount,
      accountantCount,
      managerCount,
      viewerCount,

      // Company stats
      totalCompanies,
      activeCompanies,

      // Customer stats
      totalCustomers,
      activeCustomers,
      kycVerifiedCustomers,

      // Accounting stats
      totalTransactions,
      postedTransactions,
      draftTransactions,
      totalInvoices,
      totalPayments,

      // Rental stats
      totalVehicles,
      availableVehicles,
      rentedVehicles,
      totalBookings,
      activeBookings,

      // Audit stats
      totalAuditLogs,
      todayAuditLogs,
      failedLogins,
    ] = await Promise.all([
      // Users
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { role: 'ADMIN' } }),
      this.prisma.user.count({ where: { role: 'ACCOUNTANT' } }),
      this.prisma.user.count({ where: { role: 'MANAGER' } }),
      this.prisma.user.count({ where: { role: 'VIEWER' } }),

      // Companies
      this.prisma.company.count(),
      this.prisma.company.count({ where: { isActive: true } }),

      // Customers
      this.prisma.customer.count(),
      this.prisma.customer.count({ where: { isActive: true } }),
      this.prisma.customer.count({ where: { kycVerified: true } }),

      // Accounting
      this.prisma.transaction.count(),
      this.prisma.transaction.count({ where: { status: 'POSTED' } }),
      this.prisma.transaction.count({ where: { status: 'DRAFT' } }),
      this.prisma.invoice.count(),
      this.prisma.payment.count(),

      // Rental
      this.prisma.vehicle.count(),
      this.prisma.vehicle.count({ where: { status: 'AVAILABLE' } }),
      this.prisma.vehicle.count({ where: { status: 'RENTED' } }),
      this.prisma.booking.count(),
      this.prisma.booking.count({
        where: { status: { in: ['CONFIRMED', 'ACTIVE'] } },
      }),

      // Audit
      this.prisma.auditLog.count(),
      this.prisma.auditLog.count({ where: { createdAt: { gte: today } } }),
      this.prisma.auditLog.count({
        where: {
          action: 'LOGIN',
          newValue: { path: ['success'], equals: false },
        },
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
        byRole: {
          ADMIN: adminCount,
          ACCOUNTANT: accountantCount,
          MANAGER: managerCount,
          VIEWER: viewerCount,
        },
      },
      companies: {
        total: totalCompanies,
        active: activeCompanies,
      },
      customers: {
        total: totalCustomers,
        active: activeCustomers,
        kycVerified: kycVerifiedCustomers,
      },
      accounting: {
        totalTransactions,
        postedTransactions,
        draftTransactions,
        totalInvoices,
        totalPayments,
      },
      rental: {
        totalVehicles,
        availableVehicles,
        rentedVehicles,
        totalBookings,
        activeBookings,
      },
      audit: {
        totalLogs: totalAuditLogs,
        todayLogs: todayAuditLogs,
        failedLogins,
      },
    };
  }

  /**
   * Get system health status
   */
  async getSystemHealth(): Promise<SystemHealth> {
    const startTime = Date.now();

    // Test database connection
    let dbConnected = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch (error) {
      dbConnected = false;
    }

    const responseTime = Date.now() - startTime;

    // Get table counts
    const [
      users,
      companies,
      transactions,
      invoices,
      payments,
      vehicles,
      bookings,
      auditLogs,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.company.count(),
      this.prisma.transaction.count(),
      this.prisma.invoice.count(),
      this.prisma.payment.count(),
      this.prisma.vehicle.count(),
      this.prisma.booking.count(),
      this.prisma.auditLog.count(),
    ]);

    return {
      database: {
        connected: dbConnected,
        responseTime,
      },
      tables: {
        users,
        companies,
        transactions,
        invoices,
        payments,
        vehicles,
        bookings,
        auditLogs,
      },
    };
  }

  /**
   * Get paginated audit logs with filters
   */
  async getAuditLogs(
    page: number = 1,
    limit: number = 20,
    filters: AuditLogFilters = {}
  ) {
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.AuditLogWhereInput = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.action) {
      where.action = filters.action;
    }

    if (filters.entity) {
      where.entity = filters.entity;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    if (filters.search) {
      where.OR = [
        { entity: { contains: filters.search, mode: 'insensitive' } },
        { entityId: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Get total count and logs
    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
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
        orderBy: { createdAt: 'desc' },
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
   * Get recent activity (last 24 hours)
   */
  async getRecentActivity(limit: number = 50) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const logs = await this.prisma.auditLog.findMany({
      where: {
        createdAt: { gte: oneDayAgo },
      },
      take: limit,
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
      orderBy: { createdAt: 'desc' },
    });

    return logs;
  }

  /**
   * Get user login history
   */
  async getLoginHistory(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({
        where: { action: { in: ['LOGIN', 'LOGOUT'] } },
      }),
      this.prisma.auditLog.findMany({
        where: {
          action: { in: ['LOGIN', 'LOGOUT'] },
        },
        skip,
        take: limit,
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
        orderBy: { createdAt: 'desc' },
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
   * Get failed login attempts
   */
  async getFailedLogins(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    // Failed logins are stored as audit logs with LOGIN action but no success flag
    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({
        where: {
          action: 'LOGIN',
          newValue: {
            path: ['success'],
            equals: false,
          },
        },
      }),
      this.prisma.auditLog.findMany({
        where: {
          action: 'LOGIN',
          newValue: {
            path: ['success'],
            equals: false,
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
   * Get statistics for a specific date range
   */
  async getStatsByDateRange(startDate: Date, endDate: Date) {
    const [
      transactionsCreated,
      invoicesCreated,
      paymentsCreated,
      bookingsCreated,
      usersCreated,
      auditLogCount,
    ] = await Promise.all([
      this.prisma.transaction.count({
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.invoice.count({
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.payment.count({
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.booking.count({
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.user.count({
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
    ]);

    return {
      period: {
        startDate,
        endDate,
      },
      statistics: {
        transactionsCreated,
        invoicesCreated,
        paymentsCreated,
        bookingsCreated,
        usersCreated,
        auditLogCount,
      },
    };
  }

  /**
   * Get most active users (by audit log entries)
   */
  async getMostActiveUsers(limit: number = 10) {
    // Get user activity counts
    const userActivity = await this.prisma.auditLog.groupBy({
      by: ['userId'],
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: limit,
    });

    // Get user details
    const userIds = userActivity.map((a) => a.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });

    // Combine activity counts with user details
    const result = userActivity.map((activity) => {
      const user = users.find((u) => u.id === activity.userId);
      return {
        user,
        activityCount: activity._count.id,
      };
    });

    return result;
  }
}
