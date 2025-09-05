/**
 * Fact-checking arbitration rules
 */
import { logger } from '../../utils/logger';
import { getServices } from '../services';
import { runArbitration as runComputeArbitration } from '../../integrations/compute';
import type { RuleEngine, ArbitrationContext, ArbitrationResult } from './index';

export const factCheckingRules: RuleEngine = {
  name: 'FactCheckingRules',
  description: 'Arbitrates factual claims against verifiable sources',

  /**
   * Check if this engine can handle the arbitration context
   */
  canHandle(context: ArbitrationContext): boolean {
    const claim = context.claim.toLowerCase();
    
    // Keywords that indicate fact-checking disputes
    const factCheckKeywords = [
      'true', 'false', 'fact', 'claim', 'statement', 'according to',
      'data shows', 'study found', 'research indicates', 'statistics',
      'percentage', 'number', 'amount', 'date', 'year', 'happened',
      'occurred', 'exists', 'located', 'published', 'announced'
    ];

    // Check if claim contains fact-checking keywords
    const hasFactKeywords = factCheckKeywords.some(keyword => 
      claim.includes(keyword)
    );

    // Check profile type
    const isFactCheckProfile = context.profile.id.includes('fact') || 
                              context.profile.id.includes('verification');

    const canHandle = hasFactKeywords || isFactCheckProfile;
    
    logger.debug('Fact-checking engine evaluation', {
      wagerId: context.wagerId,
      hasFactKeywords,
      isFactCheckProfile,
      canHandle
    });

    return canHandle;
  },

  /**
   * Run fact-checking arbitration
   */
  async arbitrate(context: ArbitrationContext): Promise<ArbitrationResult> {
    logger.info('Starting fact-checking arbitration', {
      wagerId: context.wagerId,
      claimLength: context.claim.length,
      sourcesLength: context.sources.length
    });

    try {
      const services = getServices();
      
      // Prepare fact-checking prompt
      const prompt = buildFactCheckPrompt(context);
      
      // Run arbitration using 0G Compute
      const computeResult = await runComputeArbitration(
        services.compute,
        services.compute.config.COMPUTE_PROVIDER_LLAMA, // Use provider address from config
        prompt,
        context.evidenceData || '',
        context.sources
      );

      // Parse the result
      const result = parseFactCheckResult(computeResult, context);
      
      logger.info('Fact-checking arbitration completed', {
        wagerId: context.wagerId,
        winner: result.winner,
        confidence: result.confidence
      });

      return result;

    } catch (error) {
      logger.error('Fact-checking arbitration failed', {
        wagerId: context.wagerId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
};

/**
 * Build fact-checking prompt for LLM
 */
function buildFactCheckPrompt(context: ArbitrationContext): string {
    return `
You are an expert fact-checker arbitrating a dispute between two parties.

CLAIM TO VERIFY:
${context.claim}

SOURCES PROVIDED:
${context.sources}

ADDITIONAL EVIDENCE:
${context.evidenceData ? JSON.stringify(context.evidenceData, null, 2) : 'None provided'}

TASK:
1. Carefully analyze the claim against the provided sources
2. Check for factual accuracy, logical consistency, and source reliability
3. Consider multiple perspectives and potential biases
4. Determine which party (A or B) has the stronger factual position

PARTY A claims the statement is TRUE/CORRECT
PARTY B claims the statement is FALSE/INCORRECT

RESPONSE FORMAT (JSON only):
{
  "winner": "A" | "B",
  "confidence": <number 0-100>,
  "reasoning": "<detailed explanation of your fact-checking process>",
  "sources": ["<source1>", "<source2>"],
  "factualAccuracy": "<assessment of claim accuracy>",
  "sourceReliability": "<assessment of source quality>"
}

Provide only valid JSON, no other text.
    `.trim();
}

/**
 * Parse fact-checking result from LLM response
 */
function parseFactCheckResult(
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
        throw new Error('Invalid winner in fact-check result');
      }

      const confidence = Number(parsedResult.confidence);
      if (isNaN(confidence) || confidence < 0 || confidence > 100) {
        throw new Error('Invalid confidence score in fact-check result');
      }

      // Build comprehensive reasoning
      const reasoning = buildReasoningText(parsedResult);

      return {
        winner: parsedResult.winner,
        confidence,
        reasoning,
        sources: Array.isArray(parsedResult.sources) ? parsedResult.sources : [],
        metadata: {
          ruleEngine: 'FactCheckingRules',
          factualAccuracy: parsedResult.factualAccuracy || 'Not assessed',
          sourceReliability: parsedResult.sourceReliability || 'Not assessed',
          claimType: 'factual',
          verificationMethod: 'source-based'
        }
      };

    } catch (error) {
      logger.error('Failed to parse fact-check result', {
        wagerId: context.wagerId,
        result: computeResult,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Fallback: Try to extract basic info
      const fallbackResult = extractFallbackResult(computeResult);
      return {
        winner: fallbackResult.winner,
        confidence: Math.max(50, fallbackResult.confidence), // Minimum 50% for fact-checks
        reasoning: `Fact-checking analysis: ${fallbackResult.reasoning}`,
        sources: [],
        metadata: {
          ruleEngine: 'FactCheckingRules',
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
    
    if (result.factualAccuracy) {
      reasoning += `\n\nFactual Accuracy: ${result.factualAccuracy}`;
    }
    
    if (result.sourceReliability) {
      reasoning += `\nSource Reliability: ${result.sourceReliability}`;
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
    const aIndicators = ['party a', 'winner: a', 'a wins', 'true', 'correct', 'accurate'];
    const bIndicators = ['party b', 'winner: b', 'b wins', 'false', 'incorrect', 'inaccurate'];
    
    let winner: 'A' | 'B' = 'A';
    let confidence = 60;
    
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
      reasoning: `Fallback fact-check analysis. Winner determined: Party ${winner}`
    };
  }
