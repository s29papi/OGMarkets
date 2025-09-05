// Re-export all types from individual files
export * from './wager';
export * from './arbitration';

// Common types used across the application
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export enum JobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
}

export interface Job {
  id: string;
  type: string;
  status: JobStatus;
  data: any;
  result?: any;
  error?: string;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
  uptime: number;
  lastCheck: Date;
  details?: Record<string, any>;
}

// Core type aliases
export type WagerId = string;
export type Address = string;
export type Hash = string;