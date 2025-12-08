import api from './api';

export interface Issue {
  id: string;
  title: string;
  description: string;
  type: 'BUG' | 'FEATURE' | 'IMPROVEMENT' | 'TASK';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  assignedToId?: string;
  assignedTo?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  reportedById: string;
  reportedBy: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  comments?: IssueComment[];
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  closedAt?: string;
}

export interface IssueComment {
  id: string;
  issueId: string;
  userId: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  comment: string;
  createdAt: string;
}

export interface CreateIssueData {
  title: string;
  description: string;
  type: string;
  priority: string;
  assignedToId?: string;
}

export interface UpdateIssueData {
  title?: string;
  description?: string;
  type?: string;
  priority?: string;
  status?: string;
  assignedToId?: string;
}

export interface IssueStats {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  byPriority: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  byType: {
    bug: number;
    feature: number;
    improvement: number;
    task: number;
  };
}

export interface IssuesResponse {
  issues: Issue[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export const issueService = {
  async listIssues(
    page = 1,
    limit = 20,
    filters?: {
      search?: string;
      status?: string;
      priority?: string;
      type?: string;
      assignedToId?: string;
      reportedById?: string;
    }
  ): Promise<IssuesResponse> {
    const response = await api.get('/admin/issues', {
      params: { page, limit, ...filters },
    });
    return response.data.data;
  },

  async getIssueById(id: string): Promise<Issue> {
    const response = await api.get(`/admin/issues/${id}`);
    return response.data.data.issue;
  },

  async createIssue(issueData: CreateIssueData): Promise<Issue> {
    const response = await api.post('/admin/issues', issueData);
    return response.data.data.issue;
  },

  async updateIssue(id: string, issueData: UpdateIssueData): Promise<Issue> {
    const response = await api.put(`/admin/issues/${id}`, issueData);
    return response.data.data.issue;
  },

  async deleteIssue(id: string): Promise<void> {
    await api.delete(`/admin/issues/${id}`);
  },

  async addComment(id: string, comment: string): Promise<IssueComment> {
    const response = await api.post(`/admin/issues/${id}/comments`, { comment });
    return response.data.data.comment;
  },

  async getIssueStats(): Promise<IssueStats> {
    const response = await api.get('/admin/issues/stats');
    return response.data.data;
  },
};