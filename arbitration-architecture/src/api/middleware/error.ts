/**
 * Error handling middleware
 */
import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

/**
 * Custom error classes
 */
export class ValidationError extends Error implements ApiError {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error implements ApiError {
  statusCode = 404;
  code = 'NOT_FOUND';
  
  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error implements ApiError {
  statusCode = 409;
  code = 'CONFLICT';
  
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class InternalServerError extends Error implements ApiError {
  statusCode = 500;
  code = 'INTERNAL_SERVER_ERROR';
  
  constructor(message: string = 'Internal server error', public details?: any) {
    super(message);
    this.name = 'InternalServerError';
  }
}

export class ServiceUnavailableError extends Error implements ApiError {
  statusCode = 503;
  code = 'SERVICE_UNAVAILABLE';
  
  constructor(message: string = 'Service temporarily unavailable') {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Main error handling middleware
 */
export function errorHandler(
  err: ApiError | Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Don't handle if response already sent
  if (res.headersSent) {
    return next(err);
  }

  // Default error properties
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'Internal server error';
  let details: any = undefined;

  // Handle known error types
  if (err instanceof ValidationError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof NotFoundError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
  } else if (err instanceof ConflictError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
  } else if (err instanceof ServiceUnavailableError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
  } else if (err.name === 'ZodError') {
    // Handle Zod validation errors
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = (err as any).errors;
  } else if (err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED')) {
    // Network errors
    statusCode = 503;
    code = 'SERVICE_UNAVAILABLE';
    message = 'External service unavailable';
  } else if (err.message.includes('timeout')) {
    statusCode = 408;
    code = 'REQUEST_TIMEOUT';
    message = 'Request timeout';
  } else if ((err as ApiError).statusCode) {
    // Custom API errors
    statusCode = (err as ApiError).statusCode!;
    code = (err as ApiError).code || 'API_ERROR';
    message = err.message;
    details = (err as ApiError).details;
  }

  // Log error (don't log 4xx as errors, they're client issues)
  const logLevel = statusCode >= 500 ? 'error' : 'warn';
  logger[logLevel]('HTTP Error', {
    method: req.method,
    url: req.url,
    statusCode,
    code,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Send error response
  const errorResponse: any = {
    error: code,
    message,
    timestamp: new Date().toISOString(),
    path: req.url,
    method: req.method
  };

  // Include details in non-production environments or for client errors
  if (details && (process.env.NODE_ENV !== 'production' || statusCode < 500)) {
    errorResponse.details = details;
  }

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development' && err.stack) {
    errorResponse.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * 404 handler for unmatched routes
 */
export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route ${req.method} ${req.url} not found`));
}

/**
 * Async wrapper that catches Promise rejections
 */
export function catchAsync(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}