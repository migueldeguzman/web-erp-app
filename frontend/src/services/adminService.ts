import api from './api';

export interface DashboardStats {
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

export interface SystemHealth {
  database: {
    status: 'healthy' | 'degraded' | 'down';
    responseTime: number;
  };
  tables: {
    users: number;
    companies: number;
    customers: number;
    vehicles: number;
    bookings: number;
    transactions: number;
    invoices: number;
    payments: number;
    auditLogs: number;
  };
  lastBackup?: string;
  version?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  entity: string;
  entityId: string;
  oldValue?: any;
  newValue?: any;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface RecentActivity {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  entity: string;
  description: string;
  createdAt: string;
}

export const adminService = {
  async getDashboardStats(): Promise<DashboardStats> {
    const response = await api.get('/admin/dashboard/stats');
    return response.data.data;
  },

  async getSystemHealth(): Promise<SystemHealth> {
    const response = await api.get('/admin/system/health');
    return response.data.data;
  },

  async getAuditLogs(
    page = 1,
    limit = 20,
    filters?: {
      userId?: string;
      action?: string;
      entity?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    }
  ) {
    const response = await api.get('/admin/audit-logs', {
      params: { page, limit, ...filters },
    });
    return response.data.data;
  },

  async getRecentActivity(limit = 10): Promise<RecentActivity[]> {
    const response = await api.get('/admin/activity/recent', {
      params: { limit },
    });
    return response.data.data.logs;
  },

  async getLoginHistory(page = 1, limit = 20) {
    const response = await api.get('/admin/activity/logins', {
      params: { page, limit },
    });
    return response.data.data;
  },

  async getFailedLogins(page = 1, limit = 20) {
    const response = await api.get('/admin/activity/failed-logins', {
      params: { page, limit },
    });
    return response.data.data;
  },

  async getStatsByDateRange(startDate: string, endDate: string) {
    const response = await api.get('/admin/stats/date-range', {
      params: { startDate, endDate },
    });
    return response.data.data;
  },

  async getMostActiveUsers(limit = 10) {
    const response = await api.get('/admin/stats/active-users', {
      params: { limit },
    });
    return response.data.data.users;
  },
};