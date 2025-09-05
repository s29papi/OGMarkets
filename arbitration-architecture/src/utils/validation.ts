import { z } from 'zod';
import { isValidAddress } from './crypto'; // crypto.ts is in the same utils/ folder

// Custom Zod validators
export const ethereumAddress = z
  .string()
  .refine(isValidAddress, 'Invalid Ethereum address');

export const weiAmount = z
  .string()
  .regex(/^\d+$/, 'Must be a valid wei amount');

export const basisPoints = z
  .number()
  .min(0)
  .max(10000)
  .int('Must be an integer between 0 and 10000');

// Validation schemas for API requests
export const createWagerSchema = z.object({
  partyB: ethereumAddress,
  token: ethereumAddress,
  stakeA: weiAmount,
  stakeB: weiAmount,
  claim: z.string().min(1).max(500),
  sources: z.string().min(1).max(1000),
  profileId: z.string(),
});

export const attachEvidenceSchema = z.object({
  wagerId: z.string(),
  rootHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  uri: z.string().url(),
});

export const submitReceiptSchema = z.object({
  wagerId: z.string(),
  winner: ethereumAddress,
  confidenceBps: basisPoints,
  traceURI: z.string().url(),
  timestamp: z.number(),
  signature: z.string(),
});

/**
 * Validate request body against schema
 */
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors = result.error.errors.map(
    (err) => `${err.path.join('.')}: ${err.message}`
  );
  
  return { success: false, errors };
}

/**
 * Sanitize user input
 */
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .slice(0, 10000); // Limit length
}

/**
 * Validate file type for evidence
 */
export function isValidEvidenceFile(mimetype: string): boolean {
  const allowedTypes = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'text/plain',
    'application/json',
  ];
  return allowedTypes.includes(mimetype);
}

/**
 * Validate file size
 */
export function isValidFileSize(sizeInBytes: number): boolean {
  const maxSizeMB = 50;
  return sizeInBytes <= maxSizeMB * 1024 * 1024;
}

export const fundWagerSchema = z.object({
  wagerId: z.string(),
  side: z.enum(['0', '1']), // Keep as string, no transformation
});