/**
 * Music chart prediction arbitration rules
 */
import { logger } from '../../utils/logger';
import { getServices } from '../services';
import { runArbitration as runComputeArbitration } from '../../integrations/compute';
import type { RuleEngine, ArbitrationContext, ArbitrationResult } from './index';

export const musicChartRules: RuleEngine = {
  name: 'MusicChartRules',
  description: 'Arbitrates music chart predictions and streaming milestones',

  /**
   * Check if this engine can handle the arbitration context
   */
  canHandle(context: ArbitrationContext): boolean {
    const claim = context.claim.toLowerCase();
    
    // Music and chart-related keywords
    const musicKeywords = [
      'spotify', 'apple music', 'youtube music', 'billboard', 'chart',
      'top 10', 'top 50', 'top 100', 'global', 'viral', 'trending',
      'song', 'track', 'artist', 'album', 'single', 'release',
      'streams', 'plays', 'listens', 'views', 'rank', 'position',
      'debut', 'peak', 'enters', 'reaches', 'hits', 'charts'
    ];

    // Platform-specific indicators
    const platformKeywords = [
      'spotify global', 'spotify viral', 'apple music daily',
      'youtube trending', 'billboard hot 100', 'kworb',
      'tiktok viral', 'soundcloud', 'deezer', 'amazon music'
    ];

    // Check if claim contains music keywords
    const hasMusicKeywords = musicKeywords.some(keyword => 
      claim.includes(keyword)
    );

    const hasPlatformKeywords = platformKeywords.some(keyword => 
      claim.includes(keyword)
    );

    // Check profile type
    const isMusicProfile = context.profile.id.includes('music') || 
                          context.profile.id.includes('chart') ||
                          context.profile.id.includes('spotify');

    const canHandle = hasMusicKeywords || hasPlatformKeywords || isMusicProfile;
    
    logger.debug('Music chart engine evaluation', {
      wagerId: context.wagerId,
      hasMusicKeywords,
      hasPlatformKeywords,
      isMusicProfile,
      canHandle
    });

    return canHandle;
  },

  /**
   * Run music chart arbitration
   */
  async arbitrate(context: ArbitrationContext): Promise<ArbitrationResult> {
    logger.info('Starting music chart arbitration', {
      wagerId: context.wagerId,
      claimLength: context.claim.length,
      sourcesLength: context.sources.length
    });

    try {
      const services = getServices();
      
      // Prepare music chart prompt
      const prompt = buildMusicChartPrompt(context);
      
      // Run arbitration using 0G Compute
      const computeResult = await runComputeArbitration(
        services.compute,
        services.compute.config.COMPUTE_PROVIDER_LLAMA,
        prompt,
        context.evidenceData || '',
        context.sources
      );

      // Parse the result
      const result = parseMusicChartResult(computeResult, context);
      
      logger.info('Music chart arbitration completed', {
        wagerId: context.wagerId,
        winner: result.winner,
        confidence: result.confidence
      });

      return result;

    } catch (error) {
      logger.error('Music chart arbitration failed', {
        wagerId: context.wagerId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
};

/**
 * Build music chart prompt for LLM
 */
function buildMusicChartPrompt(context: ArbitrationContext): string {
  const currentDate = new Date().toISOString().split('T')[0];
  
  return `
You are an expert music industry arbitrator resolving disputes about chart positions and streaming milestones.

MUSIC CLAIM:
${context.claim}

CURRENT DATE: ${currentDate}

CHART DATA SOURCES:
${context.sources}

EVIDENCE PROVIDED (Chart Snapshots/Streaming Data):
${context.evidenceData ? JSON.stringify(context.evidenceData, null, 2) : 'None provided'}

TASK:
1. Identify the specific claim about chart position, streams, or music milestone
2. Verify the actual data from official sources (Spotify Charts, Kworb, Billboard, etc.)
3. Check the specific date/time requirements in the claim
4. Compare claimed position/metrics against verified chart data
5. Consider timezone differences and chart update schedules
6. Determine if the claim has been satisfied

PARTY A claims the music prediction is TRUE/ACHIEVED
PARTY B claims the music prediction is FALSE/NOT ACHIEVED

IMPORTANT CONSIDERATIONS:
- Spotify Global Top 50 updates daily at ~00:00 UTC
- Different regions have separate charts
- "Debut" means first appearance, "Peak" means highest position
- Viral charts differ from main charts
- Some platforms have real-time vs daily charts

RESPONSE FORMAT (JSON only):
{
  "winner": "A" | "B",
  "confidence": <number 0-100>,
  "reasoning": "<detailed explanation of chart verification>",
  "sources": ["<source1>", "<source2>"],
  "chartPlatform": "<spotify/apple/billboard/etc>",
  "chartType": "<global/viral/regional>",
  "actualPosition": <number or null>,
  "claimedPosition": <number>,
  "verificationDate": "<date checked>",
  "milestoneAchieved": true | false
}

Provide only valid JSON, no other text.
  `.trim();
}

/**
 * Parse music chart result from LLM response
 */
function parseMusicChartResult(
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
      throw new Error('Invalid winner in music chart result');
    }

    const confidence = Number(parsedResult.confidence);
    if (isNaN(confidence) || confidence < 0 || confidence > 100) {
      throw new Error('Invalid confidence score in music chart result');
    }

    // Adjust confidence based on source verification
    let adjustedConfidence = confidence;
    if (parsedResult.chartPlatform === 'spotify' && parsedResult.sources?.includes('spotify.com')) {
      adjustedConfidence = Math.max(confidence, 90); // High confidence for official Spotify data
    } else if (parsedResult.sources?.includes('kworb.net')) {
      adjustedConfidence = Math.max(confidence, 85); // Good confidence for Kworb aggregation
    }

    // Build comprehensive reasoning
    const reasoning = buildReasoningText(parsedResult);

    return {
      winner: parsedResult.winner,
      confidence: adjustedConfidence,
      reasoning,
      sources: Array.isArray(parsedResult.sources) ? parsedResult.sources : [],
      metadata: {
        ruleEngine: 'MusicChartRules',
        chartPlatform: parsedResult.chartPlatform || 'unknown',
        chartType: parsedResult.chartType || 'unknown',
        actualPosition: parsedResult.actualPosition || null,
        claimedPosition: parsedResult.claimedPosition || null,
        verificationDate: parsedResult.verificationDate || new Date().toISOString(),
        milestoneAchieved: parsedResult.milestoneAchieved || false,
        claimType: 'music-chart',
        verificationMethod: 'chart-data-analysis'
      }
    };

  } catch (error) {
    logger.error('Failed to parse music chart result', {
      wagerId: context.wagerId,
      result: computeResult,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    // Fallback: Try to extract basic info
    const fallbackResult = extractFallbackResult(computeResult);
    return {
      winner: fallbackResult.winner,
      confidence: Math.max(75, fallbackResult.confidence), // Minimum 75% for chart data
      reasoning: `Music chart analysis: ${fallbackResult.reasoning}`,
      sources: [],
      metadata: {
        ruleEngine: 'MusicChartRules',
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
  
  if (result.chartPlatform) {
    reasoning += `\n\nChart Platform: ${result.chartPlatform}`;
  }
  
  if (result.chartType) {
    reasoning += `\nChart Type: ${result.chartType}`;
  }
  
  if (result.actualPosition !== undefined && result.actualPosition !== null) {
    reasoning += `\nActual Position: #${result.actualPosition}`;
  }
  
  if (result.claimedPosition) {
    reasoning += `\nClaimed Position: #${result.claimedPosition}`;
  }
  
  if (result.verificationDate) {
    reasoning += `\nVerification Date: ${result.verificationDate}`;
  }
  
  if (result.milestoneAchieved !== undefined) {
    reasoning += `\nMilestone Achieved: ${result.milestoneAchieved ? 'Yes' : 'No'}`;
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
  const aIndicators = [
    'party a', 'winner: a', 'a wins', 
    'achieved', 'reached', 'entered', 
    'charted', 'milestone met', 'position confirmed'
  ];
  const bIndicators = [
    'party b', 'winner: b', 'b wins',
    'not achieved', 'failed', 'did not enter',
    'did not chart', 'milestone not met', 'position not reached'
  ];
  
  let winner: 'A' | 'B' = 'A';
  let confidence = 75; // Default confidence for music charts
  
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
    reasoning: `Fallback music chart analysis. Winner determined: Party ${winner}`
  };
}