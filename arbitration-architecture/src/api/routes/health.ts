/**
 * Health check routes
 */
import { Router, Request, Response } from 'express';
import { checkServiceHealth, getServices } from '../../core/services';
import { getJobStats } from '../../core/jobManager';
import { logger } from '../../utils/logger';
import { catchAsync } from '../middleware/error';

const router = Router();

/**
 * Basic health check
 * GET /health
 */
router.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

/**
 * Detailed health check with service status
 * GET /health/detailed
 */
router.get('/detailed', catchAsync(async (req: Request, res: Response) => {
  try {
    // Check service health
    const serviceHealth = await checkServiceHealth();
    
    // Get job queue statistics
    const jobStats = getJobStats();
    
    // Memory and process info
    const memoryUsage = process.memoryUsage();
    const processInfo = {
      pid: process.pid,
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    };

    // Determine overall health status
    const hasErrors = Object.entries(serviceHealth).some(([key, status]) => {
      // Handle different return types from checkServiceHealth
      if (typeof status === 'boolean') {
        return status === false;
      }
      if (typeof status === 'string') {
        return status === 'down' || status === 'degraded';
      }
      return false; // Unknown status type, assume healthy
    });
    
    const overallStatus = hasErrors ? 'degraded' : 'healthy';
    const statusCode = hasErrors ? 503 : 200;

    const healthReport = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: serviceHealth,
      jobQueue: jobStats,
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`
      },
      process: processInfo
    };

    res.status(statusCode).json(healthReport);

  } catch (error) {
    logger.error('Health check failed', error);
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

/**
 * Readiness probe (for Kubernetes)
 * GET /health/ready
 */
router.get('/ready', catchAsync(async (req: Request, res: Response) => {
  try {
    // Check if services are initialized
    const services = getServices();
    
    // Basic connectivity check
    await services.provider.getBlockNumber();
    
    res.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      message: 'Service is ready to accept requests'
    });

  } catch (error) {
    logger.warn('Readiness check failed', error);
    
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: 'Service not ready',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

/**
 * Liveness probe (for Kubernetes)
 * GET /health/live
 */
router.get('/live', (req: Request, res: Response) => {
  // Simple liveness check - if we can respond, we're alive
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * Service-specific health checks
 * GET /health/services/:service
 */
router.get('/services/:service', catchAsync(async (req: Request, res: Response) => {
  const { service } = req.params;
  
  try {
    const services = getServices();
    const health = await checkServiceHealth();
    
    if (!(service in health)) {
      return res.status(404).json({
        error: 'Service not found',
        available: Object.keys(health)
      });
    }

    const serviceStatus = health[service];
    let statusCode = 200;
    let isHealthy = true;
    
    // Determine if service is healthy based on status type
    if (typeof serviceStatus === 'boolean') {
      isHealthy = serviceStatus;
    } else if (typeof serviceStatus === 'string') {
      isHealthy = serviceStatus === 'healthy' || serviceStatus === 'up';
    }
    
    statusCode = isHealthy ? 200 : 503;

    res.status(statusCode).json({
      service,
      status: serviceStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`Health check failed for service: ${service}`, error);
    
    res.status(503).json({
      service,
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

export default router;