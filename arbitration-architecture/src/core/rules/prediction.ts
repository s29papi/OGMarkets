/**
 * Prediction market arbitration rules
 */
import { logger } from '../../utils/logger';
import { getServices } from '../services';
import { runArbitration as runComputeArbitration } from '../../integrations/compute';
import type { RuleEngine, ArbitrationContext, ArbitrationResult } from './index';

export const predictionRules: RuleEngine = {
  name: 'PredictionRules',
  description: 'Arbitrates prediction markets and forecasting disputes',

  /**
   * Check if this engine can handle the arbitration context
   */
  canHandle(context: ArbitrationContext): boolean {
    const claim = context.claim.toLowerCase();
    
    // Keywords that indicate prediction market disputes
    const predictionKeywords = [
      'will', 'predict', 'forecast', 'estimate', 'expect', 'likely',
      'probability', 'chance', 'odds', 'by', 'before', 'after',
      'price will', 'market will', 'stock will', 'crypto will',
      'election', 'vote', 'win', 'outcome', 'result', 'future',
      'happen', 'occur', 'reach', 'achieve', 'exceed', 'below',
      'above', 'target', 'goal', 'deadline', 'end of', 'q1', 'q2', 'q3', 'q4'
    ];

    // Time-related keywords that suggest future events
    const timeKeywords = [
      '2025', '2026', 'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
      'next week', 'next month', 'next year', 'by end of', 'within'
    ];

    // Check if claim contains prediction keywords
    const hasPredictionKeywords = predictionKeywords.some(keyword => 
      claim.includes(keyword)
    );

    const hasTimeKeywords = timeKeywords.some(keyword => 
      claim.includes(keyword)
    );

    // Check profile type
    const isPredictionProfile = context.profile.id.includes('prediction') || 
                               context.profile.id.includes('market') ||
                               context.profile.id.includes('forecast');

    const canHandle = hasPredictionKeywords || hasTimeKeywords || isPredictionProfile;
    
    logger.debug('Prediction engine evaluation', {
      wagerId: context.wagerId,
      hasPredictionKeywords,
      hasTimeKeywords,
      isPredictionProfile,
      canHandle
    });

    return canHandle;
  },

  /**
   * Run prediction arbitration
   */
  async arbitrate(context: ArbitrationContext): Promise<ArbitrationResult> {
    logger.info('Starting prediction arbitration', {
      wagerId: context.wagerId,
      claimLength: context.claim.length,
      sourcesLength: context.sources.length
    });

    try {
      const services = getServices();
      
      // Prepare prediction prompt
      const prompt = buildPredictionPrompt(context);
      
      // Run arbitration using 0G Compute
      const computeResult = await runComputeArbitration(
        services.compute,
        services.compute.config.COMPUTE_PROVIDER_LLAMA, // Use provider address from config
        prompt,
        context.evidenceData || '',
        context.sources
      );

      // Parse the result
      const result = parsePredictionResult(computeResult, context);
      
      logger.info('Prediction arbitration completed', {
        wagerId: context.wagerId,
        winner: result.winner,
        confidence: result.confidence
      });

      return result;

    } catch (error) {
      logger.error('Prediction arbitration failed', {
        wagerId: context.wagerId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
};

/**
 * Build prediction prompt for LLM
 */
function buildPredictionPrompt(context: ArbitrationContext): string {
    const currentDate = new Date().toISOString().split('T')[0];
    
    return `
You are an expert prediction market arbitrator resolving a forecasting dispute.

PREDICTION CLAIM:
${context.claim}

CURRENT DATE: ${currentDate}

SOURCES PROVIDED:
${context.sources}

ADDITIONAL EVIDENCE:
${context.evidenceData ? JSON.stringify(context.evidenceData, null, 2) : 'None provided'}

TASK:
1. Determine if the prediction has resolved (if time-based)
2. Evaluate available evidence and data
3. Consider market conditions, trends, and relevant factors
4. Assess the likelihood or accuracy of the prediction
5. Determine which party has the stronger position

PARTY A supports the prediction/claims it will happen/is correct
PARTY B disputes the prediction/claims it won't happen/is incorrect

GUIDELINES:
- For future events: base decision on current evidence and trends
- For past events: verify actual outcomes against available data
- Consider uncertainty and provide appropriate confidence levels
- Factor in any relevant external data or market conditions

RESPONSE FORMAT (JSON only):
{
  "winner": "A" | "B",
  "confidence": <number 0-100>,
  "reasoning": "<detailed analysis of prediction and evidence>",
  "sources": ["<source1>", "<source2>"],
  "predictionStatus": "resolved" | "pending" | "unclear",
  "timeframe": "<relevant time period>",
  "keyFactors": ["<factor1>", "<factor2>"]
}

Provide only valid JSON, no other text.
    `.trim();
}

/**
 * Parse prediction result from LLM response
 */
function parsePredictionResult(
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
        throw new Error('Invalid winner in prediction result');
      }

      const confidence = Number(parsedResult.confidence);
      if (isNaN(confidence) || confidence < 0 || confidence > 100) {
        throw new Error('Invalid confidence score in prediction result');
      }

      // Build comprehensive reasoning
      const reasoning = buildReasoningText(parsedResult);

      return {
        winner: parsedResult.winner,
        confidence,
        reasoning,
        sources: Array.isArray(parsedResult.sources) ? parsedResult.sources : [],
        metadata: {
          ruleEngine: 'PredictionRules',
          predictionStatus: parsedResult.predictionStatus || 'unclear',
          timeframe: parsedResult.timeframe || 'not specified',
          keyFactors: Array.isArray(parsedResult.keyFactors) ? parsedResult.keyFactors : [],
          claimType: 'prediction',
          verificationMethod: 'trend-analysis'
        }
      };

    } catch (error) {
      logger.error('Failed to parse prediction result', {
        wagerId: context.wagerId,
        result: computeResult,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Fallback: Try to extract basic info
      const fallbackResult = extractFallbackResult(computeResult);
      return {
        winner: fallbackResult.winner,
        confidence: Math.min(80, fallbackResult.confidence), // Cap at 80% for predictions
        reasoning: `Prediction analysis: ${fallbackResult.reasoning}`,
        sources: [],
        metadata: {
          ruleEngine: 'PredictionRules',
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
  
  if (result.predictionStatus) {
    reasoning += `\n\nPrediction Status: ${result.predictionStatus}`;
  }
  
  if (result.timeframe) {
    reasoning += `\nTimeframe: ${result.timeframe}`;
  }
  
  if (result.keyFactors && result.keyFactors.length > 0) {
    reasoning += `\nKey Factors: ${result.keyFactors.join(', ')}`;
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
  const aIndicators = ['party a', 'winner: a', 'a wins', 'prediction true', 'will happen', 'correct'];
  const bIndicators = ['party b', 'winner: b', 'b wins', 'prediction false', 'won\'t happen', 'incorrect'];
  
  let winner: 'A' | 'B' = 'A';
  let confidence = 70; // Default confidence for predictions
  
  const aCount = aIndicators.filter(indicator => resultStr.includes(indicator)).length;
  const bCount = bIndicators.filter(indicator => resultStr.includes(indicator)).length;
  
  if (bCount > aCount) {
    winner = 'B';
  }
  
  // Try to extract confidence if mentioned
  const confidenceMatch = resultStr.match(/(\d+)%|confidence[:\s]*(\d+)|probability[:\s]*(\d+)/);
  if (confidenceMatch) {
    const extractedConfidence = parseInt(confidenceMatch[1] || confidenceMatch[2] || confidenceMatch[3]);
    if (!isNaN(extractedConfidence) && extractedConfidence >= 0 && extractedConfidence <= 100) {
      confidence = extractedConfidence;
    }
  }

  return {
    winner,
    confidence,
    reasoning: `Fallback prediction analysis. Winner determined: Party ${winner}`
  };
}