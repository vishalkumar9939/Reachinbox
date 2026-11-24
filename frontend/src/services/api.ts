import axios from 'axios';
import {
  Email,
  DashboardStats,
  QueueStatistics,
  RecentJob,
  SlackIntegrationStatus,
  User,
} from '../types';

const apiBaseUrl = (import.meta as any).env?.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token to all requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('reachinbox_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to handle session expiration
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Avoid infinite redirect loop if already on login page
      if (!window.location.pathname.startsWith('/login')) {
        localStorage.removeItem('reachinbox_token');
        localStorage.removeItem('reachinbox_user');
        window.location.href = '/login?expired=true';
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  getGoogleAuthUrl: async (frontendUrl?: string) => {
    const res = await api.get<{ success: boolean; url: string }>('/auth/google/url', {
      params: { frontendUrl: frontendUrl || window.location.origin },
    });
    return res.data;
  },
  verifyGoogleToken: async (data: { code?: string; credential?: string }) => {
    const res = await api.post<{
      success: boolean;
      token: string;
      user: User;
    }>('/auth/google/callback', data);
    return res.data;
  },
  devLogin: async (data?: { email?: string; name?: string }) => {
    const res = await api.post<{
      success: boolean;
      token: string;
      user: User;
    }>('/auth/dev-login', data || {});
    return res.data;
  },
  getProfile: async () => {
    const res = await api.get<{ success: boolean; user: User }>('/auth/me');
    return res.data;
  },
};

export const emailApi = {
  scheduleSingle: async (payload: {
    recipientEmail: string;
    senderEmail: string;
    subject: string;
    body: string;
    scheduledAt: string;
    delayBetweenEmails?: number;
    hourlyLimit?: number;
  }) => {
    const res = await api.post<{ success: boolean; email: Email; message: string }>('/emails/schedule', payload);
    return res.data;
  },
  scheduleBatch: async (payload: {
    recipients: string[];
    senderEmail: string;
    subject: string;
    body: string;
    startTime: string;
    delayBetweenEmails: number;
    hourlyLimit: number;
    campaignName?: string;
  }) => {
    const res = await api.post<{ success: boolean; scheduledCount: number; message: string }>(
      '/emails/batch-schedule',
      payload
    );
    return res.data;
  },
  parseRecipients: async (content: string) => {
    const res = await api.post<{
      success: boolean;
      validEmails: string[];
      validCount: number;
      invalidEmails: string[];
      invalidCount: number;
      duplicatesCount: number;
    }>('/emails/parse-recipients', { content });
    return res.data;
  },
  getEmails: async (params?: { q?: string; status?: string; page?: number; limit?: number }) => {
    const res = await api.get<{
      success: boolean;
      emails: Email[];
      total: number;
      page: number;
      totalPages: number;
      source: string;
    }>('/emails', { params });
    return res.data;
  },
  getDashboardOverview: async () => {
    const res = await api.get<{
      success: boolean;
      stats: DashboardStats;
      recentEmails: Email[];
    }>('/emails/dashboard-overview');
    return res.data;
  },
  getEmailById: async (id: string) => {
    const res = await api.get<{ success: boolean; email: Email }>(`/emails/${id}`);
    return res.data;
  },
  cancelEmail: async (id: string) => {
    const res = await api.post<{ success: boolean; message: string; email: Email }>(`/emails/${id}/cancel`);
    return res.data;
  },
  retryEmail: async (id: string) => {
    const res = await api.post<{ success: boolean; message: string; email: Email }>(`/emails/${id}/retry`);
    return res.data;
  },
};

export const queueApi = {
  getStatistics: async () => {
    const res = await api.get<{
      success: boolean;
      stats: QueueStatistics;
      recentJobs: {
        active: RecentJob[];
        delayed: RecentJob[];
        waiting: RecentJob[];
        failed: RecentJob[];
      };
    }>('/queues/stats');
    return res.data;
  },
  pauseQueue: async () => {
    const res = await api.post<{ success: boolean; message: string }>('/queues/pause');
    return res.data;
  },
  resumeQueue: async () => {
    const res = await api.post<{ success: boolean; message: string }>('/queues/resume');
    return res.data;
  },
  cleanFailed: async () => {
    const res = await api.post<{ success: boolean; message: string }>('/queues/clean-failed');
    return res.data;
  },
};

export const slackApi = {
  getAuthUrl: async () => {
    const res = await api.get<{ success: boolean; url: string; configuredInEnv: boolean }>('/slack/auth-url');
    return res.data;
  },
  getStatus: async () => {
    const res = await api.get<{ success: boolean } & SlackIntegrationStatus>('/slack/status');
    return res.data;
  },
  disconnect: async () => {
    const res = await api.post<{ success: boolean; message: string }>('/slack/disconnect');
    return res.data;
  },
  sendTestNotification: async () => {
    const res = await api.post<{ success: boolean; message: string }>('/slack/test');
    return res.data;
  },
};

export default api;
