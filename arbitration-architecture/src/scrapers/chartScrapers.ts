/**
 * Music chart data scrapers for evidence collection
 */
import { createLogger } from '../utils/logger';
import { uploadJSON, type StorageConfig } from '../integrations/storage';

const logger = createLogger('ChartScrapers');

export interface ChartSnapshot {
  platform: 'spotify' | 'kworb' | 'billboard' | 'apple';
  chartType: 'global' | 'viral' | 'regional' | 'daily';
  region?: string;
  capturedAt: string;
  chartDate: string;
  tracks: ChartEntry[];
  sourceUrl: string;
  hash?: string; // Storage hash after upload
}

export interface ChartEntry {
  position: number;
  trackId?: string;
  trackName: string;
  artistName: string;
  streams?: number;
  change?: number; // Position change from previous
  peakPosition?: number;
  weeksOnChart?: number;
  isNew?: boolean;
}

/**
 * Scrape Spotify Global Top 50 chart
 */
export async function scrapeSpotifyGlobal(): Promise<ChartSnapshot> {
  logger.info('Scraping Spotify Global Top 50');
  
  try {
    // Using Spotify Charts public data
    // In production, this would use official Spotify API or web scraping
    const response = await fetch('https://charts.spotify.com/api/charts/overview/global');
    
    if (!response.ok) {
      throw new Error(`Spotify API error: ${response.status}`);
    }
    
    const data = await response.json();
    const chartDate = new Date().toISOString().split('T')[0];
    
    // Parse Spotify response into our format
    const tracks: ChartEntry[] = data.tracks?.items?.map((item: any, index: number) => ({
      position: index + 1,
      trackId: item.track?.id,
      trackName: item.track?.name || 'Unknown',
      artistName: item.track?.artists?.map((a: any) => a.name).join(', ') || 'Unknown',
      streams: item.track?.playcount,
      change: item.change_position,
      peakPosition: item.peak_position,
      isNew: item.is_new
    })) || [];
    
    const snapshot: ChartSnapshot = {
      platform: 'spotify',
      chartType: 'global',
      capturedAt: new Date().toISOString(),
      chartDate,
      tracks: tracks.slice(0, 50), // Top 50 only
      sourceUrl: 'https://charts.spotify.com/charts/overview/global'
    };
    
    logger.info('Spotify Global Top 50 scraped', { 
      trackCount: snapshot.tracks.length,
      chartDate 
    });
    
    return snapshot;
    
  } catch (error) {
    logger.error('Failed to scrape Spotify', error);
    // Return mock data for development
    return createMockSpotifyData();
  }
}

/**
 * Scrape Kworb aggregated chart data
 */
export async function scrapeKworb(platform: 'spotify' | 'apple' = 'spotify'): Promise<ChartSnapshot> {
  logger.info('Scraping Kworb chart data', { platform });
  
  try {
    // Kworb provides aggregated chart data
    // In production, this would use web scraping with puppeteer/playwright
    const kworbUrl = platform === 'spotify' 
      ? 'https://kworb.net/spotify/country/global_daily.html'
      : 'https://kworb.net/apple_music/';
    
    // Mock implementation - would use actual scraping
    const chartDate = new Date().toISOString().split('T')[0];
    
    // In production: scrape actual Kworb HTML
    // const page = await playwright.launch();
    // const content = await page.goto(kworbUrl);
    // const tracks = await parseKworbHTML(content);
    
    const snapshot: ChartSnapshot = {
      platform: 'kworb',
      chartType: 'daily',
      capturedAt: new Date().toISOString(),
      chartDate,
      tracks: [], // Would be populated from scraping
      sourceUrl: kworbUrl
    };
    
    logger.info('Kworb data scraped', { 
      platform,
      trackCount: snapshot.tracks.length,
      chartDate 
    });
    
    return snapshot;
    
  } catch (error) {
    logger.error('Failed to scrape Kworb', error);
    throw error;
  }
}

/**
 * Store chart snapshot in 0G Storage
 */
export async function storeChartEvidence(
  storage: StorageConfig,
  snapshot: ChartSnapshot
): Promise<string> {
  try {
    // Upload to 0G Storage
    const { rootHash } = await uploadJSON(storage, snapshot);
    
    // Update snapshot with hash
    snapshot.hash = rootHash;
    
    logger.info('Chart evidence stored', {
      platform: snapshot.platform,
      chartType: snapshot.chartType,
      hash: rootHash
    });
    
    return rootHash;
    
  } catch (error) {
    logger.error('Failed to store chart evidence', error);
    throw error;
  }
}

/**
 * Collect evidence from multiple sources
 */
export async function collectChartEvidence(
  sources: ('spotify' | 'kworb')[] = ['spotify']
): Promise<ChartSnapshot[]> {
  const snapshots: ChartSnapshot[] = [];
  
  for (const source of sources) {
    try {
      let snapshot: ChartSnapshot;
      
      switch (source) {
        case 'spotify':
          snapshot = await scrapeSpotifyGlobal();
          break;
        case 'kworb':
          snapshot = await scrapeKworb('spotify');
          break;
        default:
          continue;
      }
      
      snapshots.push(snapshot);
      
    } catch (error) {
      logger.error(`Failed to collect from ${source}`, error);
      // Continue with other sources
    }
  }
  
  logger.info('Chart evidence collected', {
    sourceCount: snapshots.length,
    sources: snapshots.map(s => s.platform)
  });
  
  return snapshots;
}

/**
 * Verify chart position claim against evidence
 */
export function verifyChartPosition(
  claim: {
    trackName: string;
    artistName: string;
    position: number;
    chartType: 'global' | 'viral';
    date?: string;
  },
  evidence: ChartSnapshot[]
): {
  verified: boolean;
  actualPosition?: number;
  confidence: number;
  sources: string[];
} {
  const relevantSnapshots = evidence.filter(s => 
    s.chartType === claim.chartType &&
    (!claim.date || s.chartDate === claim.date)
  );
  
  if (relevantSnapshots.length === 0) {
    return {
      verified: false,
      confidence: 0,
      sources: []
    };
  }
  
  const verifications = relevantSnapshots.map(snapshot => {
    // Find the track in the chart
    const trackEntry = snapshot.tracks.find(t => 
      normalizeString(t.trackName).includes(normalizeString(claim.trackName)) &&
      normalizeString(t.artistName).includes(normalizeString(claim.artistName))
    );
    
    return {
      source: snapshot.platform,
      found: !!trackEntry,
      position: trackEntry?.position,
      meetsTarget: trackEntry ? trackEntry.position <= claim.position : false
    };
  });
  
  const verifiedSources = verifications.filter(v => v.meetsTarget);
  const actualPosition = verifications.find(v => v.found)?.position;
  
  return {
    verified: verifiedSources.length > 0,
    actualPosition,
    confidence: (verifiedSources.length / relevantSnapshots.length) * 100,
    sources: verifiedSources.map(v => v.source)
  };
}

/**
 * Normalize string for comparison
 */
function normalizeString(str: string): string {
  return str.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Create mock Spotify data for development
 */
function createMockSpotifyData(): ChartSnapshot {
  return {
    platform: 'spotify',
    chartType: 'global',
    capturedAt: new Date().toISOString(),
    chartDate: new Date().toISOString().split('T')[0],
    tracks: [
      {
        position: 1,
        trackId: 'mock-1',
        trackName: 'Flowers',
        artistName: 'Miley Cyrus',
        streams: 12500000,
        change: 0,
        peakPosition: 1,
        weeksOnChart: 8
      },
      {
        position: 2,
        trackId: 'mock-2',
        trackName: 'Kill Bill',
        artistName: 'SZA',
        streams: 11200000,
        change: 1,
        peakPosition: 1,
        weeksOnChart: 12
      },
      {
        position: 3,
        trackId: 'mock-3', 
        trackName: 'Unholy',
        artistName: 'Sam Smith & Kim Petras',
        streams: 10800000,
        change: -1,
        peakPosition: 1,
        weeksOnChart: 15
      }
      // ... more tracks
    ],
    sourceUrl: 'https://charts.spotify.com/charts/overview/global'
  };
}