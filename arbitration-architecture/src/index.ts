/**
 * Main application entry point
 */
import 'dotenv/config';
import { validateEnv } from './config/env';
import { initializeServices, shutdownServices } from './core/services';
import { startServer } from './api/server';
import { logger } from './utils/logger';

/**
 * Main application startup
 */
async function main() {
  try {
    logger.info('Starting ZeroGravity Arbitration Service...');

    // Validate environment configuration
    const config = validateEnv();
    logger.info('Environment configuration validated', {
      nodeEnv: config.NODE_ENV,
      rpcUrl: config.CHAIN_RPC_URL,
      port: config.PORT
    });

    // Initialize all services (contracts, 0G integrations, etc.)
    logger.info('Initializing services...');
    await initializeServices();
    logger.info('All services initialized successfully');

    // Start HTTP server
    logger.info('Starting HTTP server...', { port: config.PORT });
    await startServer(config.PORT);
    
    logger.info('🚀 ZeroGravity Arbitration Service is running!', {
      port: config.PORT,
      environment: config.NODE_ENV,
      endpoints: {
        health: `http://localhost:${config.PORT}/health`,
        api: `http://localhost:${config.PORT}/api`,
        wagers: `http://localhost:${config.PORT}/api/wagers`
      }
    });

  } catch (error) {
    logger.error('Failed to start application', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    console.error('❌ Application startup failed:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string) {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  try {
    // Shutdown services
    await shutdownServices();
    logger.info('All services shut down successfully');
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error);
    process.exit(1);
  }
}

// Handle process signals for graceful shutdown
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined
  });
  console.error('❌ Unhandled promise rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
main();