/**
 * Request validation and logging middleware
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../../utils/logger';
import { validateRequest } from '../../utils/validation';

/**
 * Request logging middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  
  // Log request
  logger.info('HTTP Request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Response', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length')
    });
  });

  next();
}

/**
 * Validation middleware factory
 */
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const validation = validateRequest(schema, req.body);
    
    if (!validation.success) {
      logger.warn('Request validation failed', {
        method: req.method,
        url: req.url,
        errors: validation.errors
      });
      
      res.status(400).json({
        error: 'Validation Error',
        message: 'Request body validation failed',
        details: validation.errors
      });
      return;
    }

    // Attach validated data to request
    req.body = validation.data;
    next();
  };
}

/**
 * Validate query parameters
 */
export function validateQuery<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const validation = validateRequest(schema, req.query);
    
    if (!validation.success) {
      logger.warn('Query validation failed', {
        method: req.method,
        url: req.url,
        errors: validation.errors
      });
      
      res.status(400).json({
        error: 'Validation Error',
        message: 'Query parameters validation failed',
        details: validation.errors
      });
      return;
    }

    req.query = validation.data as any;
    next();
  };
}

/**
 * Validate route parameters
 */
export function validateParams<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const validation = validateRequest(schema, req.params);
    
    if (!validation.success) {
      logger.warn('Params validation failed', {
        method: req.method,
        url: req.url,
        errors: validation.errors
      });
      
      res.status(400).json({
        error: 'Validation Error',
        message: 'Route parameters validation failed',
        details: validation.errors
      });
      return;
    }

    req.params = validation.data as any;
    next();
  };
}

/**
 * Content-Type validation
 */
export function requireContentType(expectedType: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentType = req.get('Content-Type');
    
    if (!contentType || !contentType.includes(expectedType)) {
      logger.warn('Invalid Content-Type', {
        method: req.method,
        url: req.url,
        expected: expectedType,
        received: contentType
      });
      
      res.status(415).json({
        error: 'Unsupported Media Type',
        message: `Expected Content-Type: ${expectedType}`,
        received: contentType
      });
      return;
    }

    next();
  };
}

/**
 * Async error wrapper
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Request timeout middleware
 */
export function requestTimeout(timeoutMs: number = 30000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        logger.error('Request timeout', {
          method: req.method,
          url: req.url,
          timeout: timeoutMs
        });
        
        res.status(408).json({
          error: 'Request Timeout',
          message: 'Request took too long to process'
        });
      }
    }, timeoutMs);

    res.on('finish', () => {
      clearTimeout(timeout);
    });

    next();
  };
}