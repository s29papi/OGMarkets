/**
 * Music prediction market API routes
 */
import { Router, Request, Response } from 'express';
import { createLogger } from '../../utils/logger';
import { getServices } from '../../core/services';
import { 
  scrapeSpotifyGlobal, 
  scrapeKworb, 
  collectChartEvidence,
  storeChartEvidence,
  verifyChartPosition,
  type ChartSnapshot 
} from '../../scrapers/chartScrapers';
import { uploadJSON, downloadJSON } from '../../integrations/storage';

const router = Router();
const logger = createLogger('MusicAPI');

/**
 * Scrape current chart data
 * POST /api/music/scrape
 */
router.post('/scrape', async (req: Request, res: Response) => {
  try {
    const { sources = ['spotify'], store = true } = req.body;
    
    logger.info('Scraping chart data', { sources });
    
    // Collect evidence from specified sources
    const snapshots = await collectChartEvidence(sources);
    
    // Store in 0G Storage if requested
    const stored: any[] = [];
    if (store) {
      const services = getServices();
      for (const snapshot of snapshots) {
        const hash = await storeChartEvidence(services.storage, snapshot);
        stored.push({
          platform: snapshot.platform,
          chartType: snapshot.chartType,
          hash,
          capturedAt: snapshot.capturedAt
        });
      }
    }
    
    res.json({
      success: true,
      snapshots: snapshots.length,
      stored: store ? stored : undefined,
      sources
    });
    
  } catch (error) {
    logger.error('Chart scraping failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Scraping failed'
    });
  }
});

/**
 * Get latest chart snapshot
 * GET /api/music/charts/:platform
 */
router.get('/charts/:platform', async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const { chartType = 'global' } = req.query;
    
    logger.info('Fetching chart data', { platform, chartType });
    
    let snapshot: ChartSnapshot;
    
    switch (platform) {
      case 'spotify':
        snapshot = await scrapeSpotifyGlobal();
        break;
      case 'kworb':
        snapshot = await scrapeKworb('spotify');
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid platform. Use: spotify, kworb'
        });
    }
    
    res.json({
      success: true,
      snapshot
    });
    
  } catch (error) {
    logger.error('Failed to fetch chart', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch chart'
    });
  }
});

/**
 * Verify a music claim against evidence
 * POST /api/music/verify
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { 
      claim,
      evidenceHashes = [],
      sources = ['spotify'] 
    } = req.body;
    
    if (!claim || !claim.trackName || !claim.artistName || !claim.position) {
      return res.status(400).json({
        success: false,
        error: 'Invalid claim. Required: trackName, artistName, position'
      });
    }
    
    logger.info('Verifying music claim', { claim });
    
    const services = getServices();
    const evidence: ChartSnapshot[] = [];
    
    // Load evidence from storage if hashes provided
    if (evidenceHashes.length > 0) {
      for (const hash of evidenceHashes) {
        try {
          const snapshot = await downloadJSON(services.storage, hash);
          evidence.push(snapshot as ChartSnapshot);
        } catch (err) {
          logger.warn('Failed to load evidence', { hash });
        }
      }
    }
    
    // If no stored evidence, scrape fresh data
    if (evidence.length === 0) {
      const freshSnapshots = await collectChartEvidence(sources);
      evidence.push(...freshSnapshots);
    }
    
    // Verify the claim
    const verification = verifyChartPosition(claim, evidence);
    
    res.json({
      success: true,
      verified: verification.verified,
      actualPosition: verification.actualPosition,
      confidence: verification.confidence,
      sources: verification.sources,
      evidenceCount: evidence.length
    });
    
  } catch (error) {
    logger.error('Verification failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Verification failed'
    });
  }
});

/**
 * Create music prediction wager
 * POST /api/music/wager/create
 */
router.post('/wager/create', async (req: Request, res: Response) => {
  try {
    const {
      trackName,
      artistName,
      targetPosition,
      chartType = 'global',
      platform = 'spotify',
      deadline,
      amount,
      partyA,
      partyB
    } = req.body;
    
    // Validate required fields
    if (!trackName || !artistName || !targetPosition || !deadline) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }
    
    // Format claim for wager
    const claim = `${trackName} by ${artistName} will reach position ${targetPosition} or better on ${platform} ${chartType} chart by ${deadline}`;
    
    // Create wager parameters
    const wagerData = {
      claim,
      profile: {
        id: `music-${platform}-${chartType}`,
        name: 'Music Chart Prediction',
        description: `${platform} ${chartType} chart position prediction`
      },
      metadata: {
        trackName,
        artistName,
        targetPosition,
        chartType,
        platform,
        deadline
      },
      amount: amount || '0.01',
      partyA: partyA || 'Claimer',
      partyB: partyB || 'Challenger'
    };
    
    logger.info('Creating music wager', wagerData);
    
    // In production, this would create on-chain wager
    // const services = getServices();
    // const wagerId = await createWagerOnChain(services.judge, wagerData);
    
    res.json({
      success: true,
      wager: {
        id: `music-${Date.now()}`, // Mock ID
        ...wagerData,
        status: 'pending',
        createdAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('Failed to create music wager', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create wager'
    });
  }
});

/**
 * Run automated chart checking job
 * POST /api/music/jobs/check
 */
router.post('/jobs/check', async (req: Request, res: Response) => {
  try {
    const { wagerId } = req.body;
    
    if (!wagerId) {
      return res.status(400).json({
        success: false,
        error: 'wagerId required'
      });
    }
    
    logger.info('Running chart check job', { wagerId });
    
    // Get wager details (mock)
    const wagerMetadata = {
      trackName: 'Example Track',
      artistName: 'Example Artist',
      targetPosition: 10,
      chartType: 'global' as const,
      platform: 'spotify'
    };
    
    // Collect fresh evidence
    const snapshots = await collectChartEvidence(['spotify', 'kworb']);
    
    // Store evidence
    const services = getServices();
    const evidenceHashes = [];
    for (const snapshot of snapshots) {
      const hash = await storeChartEvidence(services.storage, snapshot);
      evidenceHashes.push(hash);
    }
    
    // Verify claim
    const verification = verifyChartPosition({
      trackName: wagerMetadata.trackName,
      artistName: wagerMetadata.artistName,
      position: wagerMetadata.targetPosition,
      chartType: wagerMetadata.chartType
    }, snapshots);
    
    res.json({
      success: true,
      job: {
        wagerId,
        checked: true,
        verified: verification.verified,
        actualPosition: verification.actualPosition,
        confidence: verification.confidence,
        evidenceHashes,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('Chart check job failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Job failed'
    });
  }
});

/**
 * Get chart evidence for wager
 * GET /api/music/wager/:wagerId/evidence
 */
router.get('/wager/:wagerId/evidence', async (req: Request, res: Response) => {
  try {
    const { wagerId } = req.params;
    
    logger.info('Fetching wager evidence', { wagerId });
    
    // In production, fetch from database/chain
    // For now, return mock data
    const evidence = {
      wagerId,
      evidenceHashes: [
        'QmExample1234567890',
        'QmExample0987654321'
      ],
      lastChecked: new Date().toISOString(),
      checkCount: 5,
      sources: ['spotify', 'kworb']
    };
    
    res.json({
      success: true,
      evidence
    });
    
  } catch (error) {
    logger.error('Failed to fetch evidence', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch evidence'
    });
  }
});

export default router;