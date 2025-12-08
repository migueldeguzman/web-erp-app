import api from './api';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'ACCOUNTANT' | 'MANAGER' | 'VIEWER';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface UpdateUserData {
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  password?: string;
}

export interface UserActivity {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  description: string;
  createdAt: string;
}

export interface UserStats {
  totalTransactions: number;
  totalInvoices: number;
  totalPayments: number;
  lastLogin?: string;
  totalLogins: number;
  failedLogins: number;
}

export interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export const userService = {
  async listUsers(
    page = 1,
    limit = 20,
    filters?: {
      search?: string;
      role?: string;
      isActive?: boolean;
    }
  ): Promise<UsersResponse> {
    const response = await api.get('/users', {
      params: { page, limit, ...filters },
    });
    return response.data.data;
  },

  async getUserById(id: string): Promise<User> {
    const response = await api.get(`/users/${id}`);
    return response.data.data.user;
  },

  async createUser(userData: CreateUserData): Promise<User> {
    const response = await api.post('/users', userData);
    return response.data.data.user;
  },

  async updateUser(id: string, userData: UpdateUserData): Promise<User> {
    const response = await api.put(`/users/${id}`, userData);
    return response.data.data.user;
  },

  async deactivateUser(id: string): Promise<User> {
    const response = await api.post(`/users/${id}/deactivate`);
    return response.data.data.user;
  },

  async reactivateUser(id: string): Promise<User> {
    const response = await api.post(`/users/${id}/reactivate`);
    return response.data.data.user;
  },

  async deleteUser(id: string): Promise<void> {
    await api.delete(`/users/${id}`);
  },

  async getUserActivity(id: string, page = 1, limit = 20): Promise<{
    activities: UserActivity[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    const response = await api.get(`/users/${id}/activity`, {
      params: { page, limit },
    });
    return response.data.data;
  },

  async getUserStats(id: string): Promise<UserStats> {
    const response = await api.get(`/users/${id}/stats`);
    return response.data.data;
  },
};