/**
 * Arbitration Rules Engine
 */
import { logger } from '../../utils/logger';
import { factCheckingRules } from './factCheck';
import { predictionRules } from './prediction';
import { sportsRules } from './sports';
import type { ArbitrationProfile } from '../../types';

export interface ArbitrationContext {
  wagerId: string;
  claim: string;
  sources: string;
  evidenceData?: any;
  profile: ArbitrationProfile;
}

export interface ArbitrationResult {
  winner: 'A' | 'B';
  confidence: number; // 0-100
  reasoning: string;
  sources: string[];
  metadata?: Record<string, any>;
}

export interface RuleEngine {
  canHandle(context: ArbitrationContext): boolean;
  arbitrate(context: ArbitrationContext): Promise<ArbitrationResult>;
  name: string;
  description: string;
}

// Registry of all rule engines
const ruleEngines: RuleEngine[] = [
  factCheckingRules,
  predictionRules,
  sportsRules
];

/**
 * Find the appropriate rule engine for a claim
 */
export function findRuleEngine(context: ArbitrationContext): RuleEngine | null {
  // Try profile-specific engines first
  for (const engine of ruleEngines) {
    if (engine.canHandle(context)) {
      logger.info('Selected rule engine', {
        engine: engine.name,
        wagerId: context.wagerId,
        profileId: context.profile.id
      });
      return engine;
    }
  }

  logger.warn('No rule engine found for context', {
    wagerId: context.wagerId,
    profileId: context.profile.id,
    claimLength: context.claim.length
  });

  return null;
}

/**
 * Run arbitration using the appropriate rule engine
 */
export async function runArbitration(
  context: ArbitrationContext
): Promise<ArbitrationResult> {
  const engine = findRuleEngine(context);
  
  if (!engine) {
    throw new Error(`No rule engine can handle this arbitration context`);
  }

  logger.info('Starting arbitration', {
    engine: engine.name,
    wagerId: context.wagerId,
    profileId: context.profile.id
  });

  try {
    const result = await engine.arbitrate(context);
    
    // Validate result
    if (result.confidence < 0 || result.confidence > 100) {
      throw new Error(`Invalid confidence score: ${result.confidence}`);
    }
    
    if (!['A', 'B'].includes(result.winner)) {
      throw new Error(`Invalid winner: ${result.winner}`);
    }

    logger.info('Arbitration completed', {
      engine: engine.name,
      wagerId: context.wagerId,
      winner: result.winner,
      confidence: result.confidence
    });

    return result;
    
  } catch (error) {
    logger.error('Arbitration failed', {
      engine: engine.name,
      wagerId: context.wagerId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Get list of available rule engines
 */
export function getAvailableEngines(): Array<{
  name: string;
  description: string;
}> {
  return ruleEngines.map(engine => ({
    name: engine.name,
    description: engine.description
  }));
}

/**
 * Validate arbitration context
 */
export function validateContext(context: ArbitrationContext): void {
  if (!context.wagerId || typeof context.wagerId !== 'string') {
    throw new Error('Invalid wagerId');
  }
  
  if (!context.claim || typeof context.claim !== 'string') {
    throw new Error('Invalid claim');
  }
  
  if (!context.profile || typeof context.profile.id !== 'string') {
    throw new Error('Invalid profile');
  }
  
  if (context.claim.length > 10000) {
    throw new Error('Claim too long (max 10,000 characters)');
  }
  
  if (context.sources && context.sources.length > 50000) {
    throw new Error('Sources too long (max 50,000 characters)');
  }
}

/**
 * Create arbitration context from wager data
 */
export function createArbitrationContext(
  wagerId: string,
  claim: string,
  sources: string,
  profile: ArbitrationProfile,
  evidenceData?: any
): ArbitrationContext {
  const context: ArbitrationContext = {
    wagerId,
    claim,
    sources,
    profile,
    evidenceData
  };

  validateContext(context);
  return context;
}