/**
 * Wager route handlers
 */
import { Request, Response } from 'express';
import { getServices } from '../../core/services';
import { getProfile } from '../../config/profile';
import { logger } from '../../utils/logger';
import { ValidationError, NotFoundError, ConflictError } from '../middleware/error';
import { 
  createWager as createWagerOnContract,
  getWagerCore as getWagerCoreFromContract,
  getWagerMeta as getWagerMetaFromContract,
  getWagerProfile as getWagerProfileFromContract,
  getWagerVotes as getWagerVotesFromContract,
  fundEscrow
} from '../../contracts/judge';
import type { CreateWagerRequest, FundWagerRequest } from '../../types';
import {  WagerSide } from '../../types';

/**
 * Create a new wager
 * POST /api/wagers
 */
export async function createWager(req: Request, res: Response): Promise<void> {
  const wagerData: CreateWagerRequest = req.body;
  
  logger.info('Creating new wager', {
    partyB: wagerData.partyB,
    profileId: wagerData.profileId,
    stakeA: wagerData.stakeA,
    stakeB: wagerData.stakeB
  });

  try {
    const services = getServices();
    
    // Get arbitration profile
    const profile = getProfile(wagerData.profileId);
    if (!profile) {
      throw new ValidationError(`Invalid profile ID: ${wagerData.profileId}`);
    }

    // Create wager on smart contract using functional approach
    const txHash = await createWagerOnContract(
      services.judge,
      wagerData,
      profile
    );

    // Get the created wager ID from contract events
    const wagerId = await services.judge.contract.nextWagerId() - 1n;

    res.status(201).json({
      success: true,
      data: {
        wagerId: wagerId.toString(),
        txHash,
        status: 'CREATED',
        createdAt: new Date().toISOString()
      },
      message: 'Wager created successfully'
    });

  } catch (error) {
    logger.error('Failed to create wager', { error });
    throw error;
  }
}

/**
 * Get wager by ID
 * GET /api/wagers/:id
 */
export async function getWager(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  
  try {
    const services = getServices();
    
    // Get comprehensive wager data using functional approach
    const [core, meta, profile, votes] = await Promise.all([
      getWagerCoreFromContract(services.judge, id),
      getWagerMetaFromContract(services.judge, id),
      getWagerProfileFromContract(services.judge, id),
      getWagerVotesFromContract(services.judge, id)
    ]);

    const wager = {
      id,
      ...core,
      ...meta,
      ...profile,
      ...votes,
      retrievedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: wager
    });

  } catch (error) {
    logger.error('Failed to get wager', { wagerId: id, error });

    if (error instanceof Error && error.message.includes('nonexistent')) {
      throw new NotFoundError(`Wager ${id} not found`);
    }
    
    throw error;
  }
}

// Add other handler functions here...

/**
 * Get all wagers with pagination
 * GET /api/wagers
 */
export async function getWagers(req: Request, res: Response): Promise<void> {
  const { page, limit, status, partyA, partyB } = req.query as any;
  
  try {
    const services = getServices();
    
    // Get total number of wagers
    const totalWagers = await services.judge.contract.nextWagerId();
    const total = Number(totalWagers);
    
    // Calculate pagination
    const offset = (page - 1) * limit;
    const totalPages = Math.ceil(total / limit);
    
    // Get wager IDs for this page
    const wagerIds: string[] = [];
    const start = Math.max(1, total - offset - limit + 1);
    const end = Math.min(total, total - offset);
    
    for (let i = end; i >= start; i--) {
      wagerIds.push(i.toString());
    }

    // Fetch wager data for each ID
    const wagers = await Promise.all(
      wagerIds.map(async (id) => {
        try {
          const [core, meta] = await Promise.all([
            getWagerCoreFromContract(services.judge, id),
            getWagerMetaFromContract(services.judge, id)
          ]);
          
          return {
            id,
            ...core,
            claim: meta.claim,
            evidenceURI: meta.evidenceURI
          };
        } catch (error) {
          logger.warn('Failed to fetch wager', { id, error });
          return null;
        }
      })
    );

    // Filter out failed fetches and apply filters - with proper typing
    let filteredWagers = wagers.filter((w): w is NonNullable<typeof w> => w !== null);
    
    if (status) {
      filteredWagers = filteredWagers.filter(w => {
        if (w.resolved) return status === 'RESOLVED';
        if (w.fundedA && w.fundedB) return status === 'FULLY_FUNDED';
        if (w.fundedA) return status === 'FUNDED_A';
        if (w.fundedB) return status === 'FUNDED_B';
        return status === 'CREATED';
      });
    }
    
    if (partyA) {
      filteredWagers = filteredWagers.filter(w => 
        w.partyA.toLowerCase() === partyA.toLowerCase()
      );
    }
    
    if (partyB) {
      filteredWagers = filteredWagers.filter(w => 
        w.partyB.toLowerCase() === partyB.toLowerCase()
      );
    }

    res.json({
      success: true,
      data: {
        wagers: filteredWagers,
        pagination: {
          page,
          limit,
          total: filteredWagers.length,
          totalPages: Math.ceil(filteredWagers.length / limit),
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    logger.error('Failed to get wagers', {
      page,
      limit,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    throw error;
  }
}

/**
 * Fund a wager
 * POST /api/wagers/:id/fund
 */
export async function fundWager(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { side }: FundWagerRequest = req.body;
  
  logger.info('Funding wager', {
    wagerId: id,
    side: side === 0 ? 'A' : 'B'
  });

  try {
    const services = getServices();
    
    // Check wager exists and get current state
    const core = await getWagerCoreFromContract(services.judge, id); // ✅ Fixed
    
    // Check if already funded
    if ((side === WagerSide.A && core.fundedA) || 
        (side === WagerSide.B && core.fundedB)) {
      throw new ConflictError(`Side ${side === 0 ? 'A' : 'B'} already funded`);
    }

    // Fund the escrow
    const txHash = await fundEscrow(services.judge, id, side);

    logger.info('Wager funded successfully', {
      wagerId: id,
      side: side === 0 ? 'A' : 'B',
      txHash
    });

    res.json({
      success: true,
      data: {
        wagerId: id,
        side: side === 0 ? 'A' : 'B',
        txHash,
        fundedAt: new Date().toISOString()
      },
      message: 'Wager funded successfully'
    });

  } catch (error) {
    logger.error('Failed to fund wager', {
      wagerId: id,
      side,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    if (error instanceof Error && error.message.includes('revert')) {
      throw new ConflictError('Smart contract rejected the funding');
    }
    
    throw error;
  }
}

/**
 * Get wager core data
 * GET /api/wagers/:id/core
 */
export async function getWagerCore(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  
  try {
    const services = getServices();
    const core = await getWagerCoreFromContract(services.judge, id); // ✅ Fixed
    
    res.json({
      success: true,
      data: core
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('nonexistent')) {
      throw new NotFoundError(`Wager ${id} not found`);
    }
    throw error;
  }
}

/**
 * Get wager metadata
 * GET /api/wagers/:id/meta
 */
export async function getWagerMeta(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  
  try {
    const services = getServices();
    const meta = await getWagerMetaFromContract(services.judge, id); // ✅ Fixed
    
    res.json({
      success: true,
      data: meta
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('nonexistent')) {
      throw new NotFoundError(`Wager ${id} not found`);
    }
    throw error;
  }
}

/**
 * Get wager arbitration profile
 * GET /api/wagers/:id/profile
 */
export async function getWagerProfile(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  
  try {
    const services = getServices();
    const profile = await getWagerProfileFromContract(services.judge, id); // ✅ Fixed
    
    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('nonexistent')) {
      throw new NotFoundError(`Wager ${id} not found`);
    }
    throw error;
  }
}

/**
 * Get wager voting status
 * GET /api/wagers/:id/votes
 */
export async function getWagerVotes(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  
  try {
    const services = getServices();
    const votes = await getWagerVotesFromContract(services.judge, id); // ✅ Fixed
    
    res.json({
      success: true,
      data: votes
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('nonexistent')) {
      throw new NotFoundError(`Wager ${id} not found`);
    }
    throw error;
  }
}

/**
 * Get wagers by party address
 * GET /api/wagers/party/:address
 */
export async function getWagersByParty(req: Request, res: Response): Promise<void> {
  const { address } = req.params;
  const { page, limit } = req.query as any;
  
  // This would typically involve event filtering or database queries
  // For now, we'll get all wagers and filter (not efficient for production)
  
  try {
    const services = getServices();
    const totalWagers = await services.judge.contract.nextWagerId();
    
    const wagers = [];
    const maxCheck = Math.min(Number(totalWagers), 100); // Limit for demo
    
    for (let i = 1; i <= maxCheck; i++) {
      try {
        const core = await getWagerCoreFromContract(services.judge, i.toString());
        if (core.partyA.toLowerCase() === address.toLowerCase() || 
            core.partyB.toLowerCase() === address.toLowerCase()) {
          wagers.push({
            id: i.toString(),
            ...core
          });
        }
      } catch (error) {
        // Skip non-existent wagers
        continue;
      }
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedWagers = wagers.slice(start, end);

    res.json({
      success: true,
      data: {
        wagers: paginatedWagers,
        pagination: {
          page,
          limit,
          total: wagers.length,
          totalPages: Math.ceil(wagers.length / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Failed to get wagers by party', {
      address,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    throw error;
  }
}

/**
 * Get wager events/history (placeholder)
 * GET /api/wagers/:id/events
 */
export async function getWagerEvents(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  
  // In a real implementation, this would query blockchain events
  res.json({
    success: true,
    data: {
      events: [],
      message: 'Event history not yet implemented'
    }
  });
}