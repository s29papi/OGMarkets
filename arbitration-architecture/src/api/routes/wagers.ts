/**
 * Wager routes
 */
import { Router } from 'express';
import { z } from 'zod';
import { validateBody, validateParams, validateQuery, asyncHandler } from '../middleware/validation';
import { createWagerSchema, fundWagerSchema } from '../../utils/validation';
import * as wagerHandlers from '../handlers/wagerHandler';

const router = Router();

// Validation schemas
const wagerIdSchema = z.object({
  id: z.string().min(1)
});

const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['CREATED', 'FUNDED_A', 'FUNDED_B', 'FULLY_FUNDED', 'ARBITRATING', 'RESOLVED', 'DISPUTED']).optional(),
  partyA: z.string().optional(),
  partyB: z.string().optional()
});

/**
 * Create a new wager
 * POST /api/wagers
 */
router.post(
  '/',
  validateBody(createWagerSchema),
  asyncHandler(wagerHandlers.createWager)
);

/**
 * Get wager by ID
 * GET /api/wagers/:id
 */
router.get(
  '/:id',
  validateParams(wagerIdSchema),
  asyncHandler(wagerHandlers.getWager)
);

/**
 * Get all wagers with pagination and filtering
 * GET /api/wagers
 */
router.get(
  '/',
  validateQuery(paginationSchema),
  asyncHandler(wagerHandlers.getWagers)
);

/**
 * Fund a wager
 * POST /api/wagers/:id/fund
 */
router.post(
  '/:id/fund',
  validateParams(wagerIdSchema),
  validateBody(fundWagerSchema),
  asyncHandler(wagerHandlers.fundWager)
);

/**
 * Get wager core data from smart contract
 * GET /api/wagers/:id/core
 */
router.get(
  '/:id/core',
  validateParams(wagerIdSchema),
  asyncHandler(wagerHandlers.getWagerCore)
);

/**
 * Get wager metadata from smart contract
 * GET /api/wagers/:id/meta
 */
router.get(
  '/:id/meta',
  validateParams(wagerIdSchema),
  asyncHandler(wagerHandlers.getWagerMeta)
);

/**
 * Get wager arbitration profile
 * GET /api/wagers/:id/profile
 */
router.get(
  '/:id/profile',
  validateParams(wagerIdSchema),
  asyncHandler(wagerHandlers.getWagerProfile)
);

/**
 * Get wager voting status
 * GET /api/wagers/:id/votes
 */
router.get(
  '/:id/votes',
  validateParams(wagerIdSchema),
  asyncHandler(wagerHandlers.getWagerVotes)
);

/**
 * Get wagers by party address
 * GET /api/wagers/party/:address
 */
router.get(
  '/party/:address',
  validateParams(z.object({ address: z.string() })),
  validateQuery(paginationSchema),
  asyncHandler(wagerHandlers.getWagersByParty)
);

/**
 * Get wager events/history
 * GET /api/wagers/:id/events
 */
router.get(
  '/:id/events',
  validateParams(wagerIdSchema),
  asyncHandler(wagerHandlers.getWagerEvents)
);

export default router;