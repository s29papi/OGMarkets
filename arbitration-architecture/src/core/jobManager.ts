/**
 * Job Manager with retry logic for arbitration tasks
 */
import { logger } from '../utils/logger';
import type { WagerId, ArbitrationProfile } from '../types';

export interface ArbitrationJob {
  id: string;
  wagerId: WagerId;
  profileId: string;
  claim: string;
  sources: string;
  evidenceRootHash: string;
  evidenceURI: string;
  createdAt: Date;
  attempts: number;
  maxAttempts: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: {
    winner: 'A' | 'B';
    confidence: number;
    reasoning: string;
    traceURI: string;
  };
  error?: string;
}

export interface JobQueue {
  jobs: Map<string, ArbitrationJob>;
  processing: Set<string>;
}

const jobQueue: JobQueue = {
  jobs: new Map(),
  processing: new Set()
};

/**
 * Submit a new arbitration job
 */
export function submitArbitrationJob(
  wagerId: WagerId,
  profileId: string,
  claim: string,
  sources: string,
  evidenceRootHash: string,
  evidenceURI: string,
  maxAttempts = 3
): ArbitrationJob {
  const job: ArbitrationJob = {
    id: `${wagerId}-${Date.now()}`,
    wagerId,
    profileId,
    claim,
    sources,
    evidenceRootHash,
    evidenceURI,
    createdAt: new Date(),
    attempts: 0,
    maxAttempts,
    status: 'pending'
  };

  jobQueue.jobs.set(job.id, job);
  
  logger.info('Arbitration job submitted', {
    jobId: job.id,
    wagerId,
    profileId
  });

  return job;
}

/**
 * Get next pending job for processing
 */
export function getNextJob(): ArbitrationJob | null {
  for (const [jobId, job] of jobQueue.jobs) {
    if (job.status === 'pending' && !jobQueue.processing.has(jobId)) {
      return job;
    }
  }
  return null;
}

/**
 * Mark job as processing
 */
export function markJobProcessing(jobId: string): void {
  const job = jobQueue.jobs.get(jobId);
  if (job) {
    job.status = 'processing';
    job.attempts++;
    jobQueue.processing.add(jobId);
    
    logger.info('Job marked as processing', {
      jobId,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts
    });
  }
}

/**
 * Complete a job successfully
 */
export function completeJob(
  jobId: string,
  result: {
    winner: 'A' | 'B';
    confidence: number;
    reasoning: string;
    traceURI: string;
  }
): void {
  const job = jobQueue.jobs.get(jobId);
  if (job) {
    job.status = 'completed';
    job.result = result;
    jobQueue.processing.delete(jobId);
    
    logger.info('Job completed successfully', {
      jobId,
      winner: result.winner,
      confidence: result.confidence
    });
  }
}

/**
 * Fail a job (with retry logic)
 */
export function failJob(jobId: string, error: string): void {
  const job = jobQueue.jobs.get(jobId);
  if (!job) return;

  jobQueue.processing.delete(jobId);

  if (job.attempts < job.maxAttempts) {
    // Retry the job
    job.status = 'pending';
    job.error = `Attempt ${job.attempts} failed: ${error}`;
    
    logger.warn('Job failed, will retry', {
      jobId,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts,
      error
    });
  } else {
    // Max attempts reached
    job.status = 'failed';
    job.error = `Failed after ${job.attempts} attempts: ${error}`;
    
    logger.error('Job failed permanently', {
      jobId,
      attempts: job.attempts,
      error
    });
  }
}

/**
 * Get job by ID
 */
export function getJob(jobId: string): ArbitrationJob | undefined {
  return jobQueue.jobs.get(jobId);
}

/**
 * Get all jobs for a wager
 */
export function getJobsForWager(wagerId: WagerId): ArbitrationJob[] {
  const jobs: ArbitrationJob[] = [];
  for (const job of jobQueue.jobs.values()) {
    if (job.wagerId === wagerId) {
      jobs.push(job);
    }
  }
  return jobs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/**
 * Get job statistics
 */
export function getJobStats(): {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
} {
  let pending = 0;
  let processing = 0;
  let completed = 0;
  let failed = 0;

  for (const job of jobQueue.jobs.values()) {
    switch (job.status) {
      case 'pending':
        pending++;
        break;
      case 'processing':
        processing++;
        break;
      case 'completed':
        completed++;
        break;
      case 'failed':
        failed++;
        break;
    }
  }

  return {
    pending,
    processing,
    completed,
    failed,
    total: jobQueue.jobs.size
  };
}

/**
 * Clean up old completed/failed jobs
 */
export function cleanupOldJobs(maxAgeHours = 24): number {
  const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
  const cutoff = new Date(Date.now() - maxAge);
  
  let cleaned = 0;
  
  for (const [jobId, job] of jobQueue.jobs) {
    if (
      job.createdAt < cutoff &&
      (job.status === 'completed' || job.status === 'failed')
    ) {
      jobQueue.jobs.delete(jobId);
      jobQueue.processing.delete(jobId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.info('Cleaned up old jobs', { cleaned, cutoff });
  }

  return cleaned;
}

/**
 * Reset job to pending status (for manual retry)
 */
export function retryJob(jobId: string): boolean {
  const job = jobQueue.jobs.get(jobId);
  if (!job) return false;

  if (job.status === 'failed' || job.status === 'completed') {
    job.status = 'pending';
    job.attempts = 0;
    job.error = undefined;
    job.result = undefined;
    jobQueue.processing.delete(jobId);
    
    logger.info('Job reset for retry', { jobId });
    return true;
  }

  return false;
}