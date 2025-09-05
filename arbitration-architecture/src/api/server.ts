/**
 * Express server setup with middleware
 */
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';
import { errorHandler } from './middleware/error';
import { requestLogger } from './middleware/validation';

// Import routes
import healthRoutes from './routes/health';
import wagerRoutes from './routes/wagers';
// import evidenceRoutes from './routes/evidence';
// import arbitrationRoutes from './routes/arbitration';

/**
 * Create Express application with middleware
 */
export function createApp(): express.Application {
  const app = express();

  // Trust proxy (for rate limiting behind reverse proxy)
  app.set('trust proxy', 1);

  // CORS configuration
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }));

  // Compression middleware
  app.use(compression());

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  app.use(requestLogger);

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
      error: 'Too many requests from this IP, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use(limiter);

  // Stricter rate limiting for arbitration endpoints
  const arbitrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit arbitration requests
    message: {
      error: 'Too many arbitration requests, please try again later'
    }
  });

  // API routes
  app.use('/health', healthRoutes);
  app.use('/api/wagers', wagerRoutes);
//   app.use('/api/evidence', evidenceRoutes);
//   app.use('/api/arbitration', arbitrationLimiter, arbitrationRoutes);

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      name: 'ZeroGravity Arbitration API',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        health: '/health',
        wagers: '/api/wagers',
        evidence: '/api/evidence',
        arbitration: '/api/arbitration'
      }
    });
  });

  // 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.originalUrl} not found`,
      availableRoutes: ['/health', '/api/wagers', '/api/evidence', '/api/arbitration']
    });
  });

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
}

/**
 * Start the HTTP server
 */
export async function startServer(port: number = 3001): Promise<express.Application> {
  const app = createApp();

  return new Promise((resolve, reject) => {
    const server = app.listen(port, (err?: Error) => {
      if (err) {
        logger.error('Failed to start server', { port, error: err.message });
        reject(err);
      } else {
        logger.info('Server started successfully', { 
          port,
          environment: process.env.NODE_ENV || 'development',
          timestamp: new Date().toISOString()
        });
        resolve(app);
      }
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
  });
}