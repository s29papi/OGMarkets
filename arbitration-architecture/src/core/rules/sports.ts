/**
 * Sports outcome arbitration rules
 */
import { logger } from '../../utils/logger';
import { getServices } from '../services';
import { runArbitration as runComputeArbitration } from '../../integrations/compute';
import type { RuleEngine, ArbitrationContext, ArbitrationResult } from './index';

export const sportsRules: RuleEngine = {
  name: 'SportsRules',
  description: 'Arbitrates sports outcomes, scores, and competition results',

  /**
   * Check if this engine can handle the arbitration context
   */
  canHandle(context: ArbitrationContext): boolean {
    const claim = context.claim.toLowerCase();
    
    // Sports-related keywords
    const sportsKeywords = [
      'game', 'match', 'score', 'win', 'lose', 'defeat', 'beat',
      'team', 'player', 'athlete', 'competition', 'tournament',
      'championship', 'league', 'season', 'playoff', 'final',
      'goal', 'point', 'touchdown', 'basket', 'home run', 'run'
    ];

    // Specific sports
    const specificSports = [
      'football', 'soccer', 'basketball', 'baseball', 'tennis',
      'hockey', 'cricket', 'rugby', 'golf', 'boxing', 'mma',
      'nfl', 'nba', 'mlb', 'nhl', 'fifa', 'uefa', 'premier league',
      'champions league', 'world cup', 'olympics', 'super bowl'
    ];

    // Sports outcome indicators
    const outcomeKeywords = [
      'won', 'lost', 'tied', 'drew', 'victory', 'defeat',
      'champion', 'winner', 'loser', 'result', 'outcome',
      'final score', 'halftime', 'overtime', 'penalty'
    ];

    // Check if claim contains sports keywords
    const hasSportsKeywords = sportsKeywords.some(keyword => 
      claim.includes(keyword)
    );

    const hasSpecificSports = specificSports.some(sport => 
      claim.includes(sport)
    );

    const hasOutcomeKeywords = outcomeKeywords.some(keyword => 
      claim.includes(keyword)
    );

    // Check profile type
    const isSportsProfile = context.profile.id.includes('sport') || 
                           context.profile.id.includes('game') ||
                           context.profile.id.includes('competition');

    const canHandle = hasSportsKeywords || hasSpecificSports || hasOutcomeKeywords || isSportsProfile;
    
    logger.debug('Sports engine evaluation', {
      wagerId: context.wagerId,
      hasSportsKeywords,
      hasSpecificSports,
      hasOutcomeKeywords,
      isSportsProfile,
      canHandle
    });

    return canHandle;
  },

  /**
   * Run sports arbitration
   */
  async arbitrate(context: ArbitrationContext): Promise<ArbitrationResult> {
    logger.info('Starting sports arbitration', {
      wagerId: context.wagerId,
      claimLength: context.claim.length,
      sourcesLength: context.sources.length
    });

    try {
      const services = getServices();
      
      // Prepare sports prompt
      const prompt = buildSportsPrompt(context);
      
      // Run arbitration using 0G Compute
      const computeResult = await runComputeArbitration(
        services.compute,
        services.compute.config.COMPUTE_PROVIDER_LLAMA, // Use provider address from config
        prompt,
        context.evidenceData || '',
        context.sources
      );

      // Parse the result
      const result = parseSportsResult(computeResult, context);
      
      logger.info('Sports arbitration completed', {
        wagerId: context.wagerId,
        winner: result.winner,
        confidence: result.confidence
      });

      return result;

    } catch (error) {
      logger.error('Sports arbitration failed', {
        wagerId: context.wagerId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
};

/**
 * Build sports prompt for LLM
 */
function buildSportsPrompt(context: ArbitrationContext): string {
    const currentDate = new Date().toISOString().split('T')[0];
    
    return `
You are an expert sports arbitrator resolving a dispute about sports outcomes.

SPORTS CLAIM:
${context.claim}

CURRENT DATE: ${currentDate}

SOURCES PROVIDED:
${context.sources}

ADDITIONAL EVIDENCE:
${context.evidenceData ? JSON.stringify(context.evidenceData, null, 2) : 'None provided'}

TASK:
1. Identify the specific sport, teams/players, and event in question
2. Verify the actual outcome from reliable sports sources
3. Check official records, league websites, and credible sports news
4. Consider any disputes, overturned decisions, or clarifications
5. Determine which party has the correct information

PARTY A claims a specific sports outcome/result
PARTY B disputes that outcome/result

GUIDELINES:
- Prioritize official league/organization sources
- Consider only final, confirmed results (not preliminary)
- Account for any rule changes, penalties, or appeals
- Be aware of different time zones and reporting delays
- Distinguish between regular season, playoffs, and exhibition games

RESPONSE FORMAT (JSON only):
{
  "winner": "A" | "B",
  "confidence": <number 0-100>,
  "reasoning": "<detailed verification of sports outcome>",
  "sources": ["<source1>", "<source2>"],
  "sportType": "<basketball/football/soccer/etc>",
  "eventType": "<regular season/playoff/championship/etc>",
  "officialResult": "<verified outcome>",
  "verificationLevel": "official" | "credible" | "preliminary"
}

Provide only valid JSON, no other text.
    `.trim();
}

/**
 * Parse sports result from LLM response
 */
function parseSportsResult(
    computeResult: any, 
    context: ArbitrationContext
  ): ArbitrationResult {
    try {
      // Handle different response formats
      let parsedResult;
      
      if (typeof computeResult === 'string') {
        parsedResult = JSON.parse(computeResult);
      } else if (computeResult.response) {
        parsedResult = JSON.parse(computeResult.response);
      } else {
        parsedResult = computeResult;
      }

      // Validate required fields
      if (!parsedResult.winner || !['A', 'B'].includes(parsedResult.winner)) {
        throw new Error('Invalid winner in sports result');
      }

      const confidence = Number(parsedResult.confidence);
      if (isNaN(confidence) || confidence < 0 || confidence > 100) {
        throw new Error('Invalid confidence score in sports result');
      }

      // Adjust confidence based on verification level
      let adjustedConfidence = confidence;
      if (parsedResult.verificationLevel === 'official') {
        adjustedConfidence = Math.max(confidence, 85); // High confidence for official results
      } else if (parsedResult.verificationLevel === 'preliminary') {
        adjustedConfidence = Math.min(confidence, 75); // Lower confidence for preliminary
      }

      // Build comprehensive reasoning
      const reasoning = buildReasoningText(parsedResult);

      return {
        winner: parsedResult.winner,
        confidence: adjustedConfidence,
        reasoning,
        sources: Array.isArray(parsedResult.sources) ? parsedResult.sources : [],
        metadata: {
          ruleEngine: 'SportsRules',
          sportType: parsedResult.sportType || 'unknown',
          eventType: parsedResult.eventType || 'unknown',
          officialResult: parsedResult.officialResult || 'not specified',
          verificationLevel: parsedResult.verificationLevel || 'credible',
          claimType: 'sports',
          verificationMethod: 'official-records'
        }
      };

    } catch (error) {
      logger.error('Failed to parse sports result', {
        wagerId: context.wagerId,
        result: computeResult,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Fallback: Try to extract basic info
      const fallbackResult = extractFallbackResult(computeResult);
      return {
        winner: fallbackResult.winner,
        confidence: Math.max(70, fallbackResult.confidence), // Minimum 70% for sports
        reasoning: `Sports outcome analysis: ${fallbackResult.reasoning}`,
        sources: [],
        metadata: {
          ruleEngine: 'SportsRules',
          parseError: true,
          originalResult: String(computeResult)
        }
      };
    }
}

/**
 * Build detailed reasoning text
 */
function buildReasoningText(result: any): string {
    let reasoning = result.reasoning || 'No detailed reasoning provided.';
    
    if (result.sportType) {
      reasoning += `\n\nSport: ${result.sportType}`;
    }
    
    if (result.eventType) {
      reasoning += `\nEvent Type: ${result.eventType}`;
    }
    
    if (result.officialResult) {
      reasoning += `\nOfficial Result: ${result.officialResult}`;
    }
    
    if (result.verificationLevel) {
      reasoning += `\nVerification Level: ${result.verificationLevel}`;
    }
    
    if (result.sources && result.sources.length > 0) {
      reasoning += `\nSources Consulted: ${result.sources.join(', ')}`;
    }

    return reasoning;
}

/**
 * Extract basic result if JSON parsing fails
 */
function extractFallbackResult(result: any): { winner: 'A' | 'B'; confidence: number; reasoning: string } {
    const resultStr = String(result).toLowerCase();
    
    // Try to find winner indicators
    const aIndicators = ['party a', 'winner: a', 'a wins', 'correct', 'accurate', 'confirmed'];
    const bIndicators = ['party b', 'winner: b', 'b wins', 'incorrect', 'inaccurate', 'disputed'];
    
    let winner: 'A' | 'B' = 'A';
    let confidence = 75; // Default confidence for sports outcomes
    
    const aCount = aIndicators.filter(indicator => resultStr.includes(indicator)).length;
    const bCount = bIndicators.filter(indicator => resultStr.includes(indicator)).length;
    
    if (bCount > aCount) {
      winner = 'B';
    }
    
    // Try to extract confidence if mentioned
    const confidenceMatch = resultStr.match(/(\d+)%|confidence[:\s]*(\d+)/);
    if (confidenceMatch) {
      const extractedConfidence = parseInt(confidenceMatch[1] || confidenceMatch[2]);
      if (!isNaN(extractedConfidence) && extractedConfidence >= 0 && extractedConfidence <= 100) {
        confidence = extractedConfidence;
      }
    }

    return {
      winner,
      confidence,
      reasoning: `Fallback sports analysis. Winner determined: Party ${winner}`
    };
}