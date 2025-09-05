import { ethers } from 'ethers';
import { createLogger } from '../utils/logger';
import type { ArbitrationReceipt } from '../types';

const logger = createLogger('EIP712Signer');

// EIP-712 Domain
const DOMAIN_NAME = 'ZeroGravityJudge';
const DOMAIN_VERSION = '1';

// Type definitions for EIP-712
const EIP712_TYPES = {
  ArbitrationReceipt: [
    { name: 'wagerId', type: 'uint256' },
    { name: 'winner', type: 'address' },
    { name: 'confidenceBps', type: 'uint96' },
    { name: 'traceURI', type: 'string' },
    { name: 'timestamp', type: 'uint256' },
  ],
};

export interface SignerConfig {
  signer: ethers.Signer;
  domain: ethers.TypedDataDomain;
  chainId?: bigint;
}

// ============ Signer Factory ============

export async function createEIP712Signer(
  signer: ethers.Signer,
  contractAddress: string
): Promise<SignerConfig> {
  const network = await signer.provider!.getNetwork();
  const chainId = network.chainId;

  const domain: ethers.TypedDataDomain = {
    name: DOMAIN_NAME,
    version: DOMAIN_VERSION,
    chainId,
    verifyingContract: contractAddress,
  };

  logger.info('EIP-712 domain initialized', {
    chainId: chainId.toString(),
    contract: contractAddress,
  });

  return {
    signer,
    domain,
    chainId,
  };
}

// ============ Signing Functions ============

/**
 * Sign an arbitration receipt using EIP-712
 */
export async function signReceipt(
  config: SignerConfig,
  receipt: ArbitrationReceipt
): Promise<string> {
  if (!config.domain.verifyingContract) {
    throw new Error('Signer not initialized properly');
  }

  // Convert receipt to proper format for signing
  const value = {
    wagerId: receipt.wagerId,
    winner: receipt.winner,
    confidenceBps: receipt.confidenceBps,
    traceURI: receipt.traceURI,
    timestamp: receipt.timestamp,
  };

  try {
    // Sign the typed data
    const signature = await config.signer.signTypedData(
      config.domain,
      EIP712_TYPES,
      value
    );

    logger.info('Receipt signed', {
      wagerId: receipt.wagerId,
      signer: await config.signer.getAddress(),
    });

    return signature;
  } catch (error) {
    logger.error('Failed to sign receipt', error);
    throw error;
  }
}

/**
 * Verify a signed receipt
 */
export async function verifyReceipt(
  config: SignerConfig,
  receipt: ArbitrationReceipt,
  signature: string,
  expectedSigner: string
): Promise<boolean> {
  if (!config.domain.verifyingContract) {
    throw new Error('Signer not initialized properly');
  }

  const value = {
    wagerId: receipt.wagerId,
    winner: receipt.winner,
    confidenceBps: receipt.confidenceBps,
    traceURI: receipt.traceURI,
    timestamp: receipt.timestamp,
  };

  try {
    const recoveredAddress = ethers.verifyTypedData(
      config.domain,
      EIP712_TYPES,
      value,
      signature
    );

    const isValid = 
      recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();

    logger.info('Receipt verification', {
      wagerId: receipt.wagerId,
      recoveredAddress,
      expectedSigner,
      isValid,
    });

    return isValid;
  } catch (error) {
    logger.error('Failed to verify receipt', error);
    return false;
  }
}

/**
 * Get the EIP-712 digest for a receipt (for debugging/verification)
 */
export function getReceiptDigest(
  config: SignerConfig,
  receipt: ArbitrationReceipt
): string {
  if (!config.domain.verifyingContract) {
    throw new Error('Signer not initialized properly');
  }

  const value = {
    wagerId: receipt.wagerId,
    winner: receipt.winner,
    confidenceBps: receipt.confidenceBps,
    traceURI: receipt.traceURI,
    timestamp: receipt.timestamp,
  };

  const digest = ethers.TypedDataEncoder.hash(
    config.domain,
    EIP712_TYPES,
    value
  );

  return digest;
}

// ============ Helper Functions ============

/**
 * Create a receipt object with proper formatting
 */
export function createArbitrationReceipt(
  wagerId: string,
  winner: string,
  confidenceBps: number,
  traceURI: string,
  timestamp?: number
): ArbitrationReceipt {
  return {
    wagerId,
    winner,
    confidenceBps,
    traceURI,
    timestamp: timestamp || Math.floor(Date.now() / 1000),
  };
}

/**
 * Format a receipt for contract submission
 */
export function formatReceiptForContract(receipt: ArbitrationReceipt) {
  return {
    wagerId: receipt.wagerId,
    winner: receipt.winner,
    confidenceBps: receipt.confidenceBps,
    traceURI: receipt.traceURI,
    timestamp: receipt.timestamp,
  };
}

/**
 * Validate receipt data before signing
 */
export function validateReceipt(receipt: ArbitrationReceipt): void {
  if (!receipt.wagerId || receipt.wagerId === '0') {
    throw new Error('Invalid wagerId');
  }

  if (!ethers.isAddress(receipt.winner)) {
    throw new Error('Invalid winner address');
  }

  if (receipt.confidenceBps < 0 || receipt.confidenceBps > 10000) {
    throw new Error('Confidence must be between 0 and 10000 basis points');
  }

  if (!receipt.traceURI || receipt.traceURI.trim() === '') {
    throw new Error('TraceURI is required');
  }

  if (!receipt.timestamp || receipt.timestamp <= 0) {
    throw new Error('Invalid timestamp');
  }
}

/**
 * Get signer address
 */
export async function getSignerAddress(config: SignerConfig): Promise<string> {
  return config.signer.getAddress();
}

/**
 * Get domain configuration
 */
export function getDomain(config: SignerConfig): ethers.TypedDataDomain {
  return { ...config.domain };
}