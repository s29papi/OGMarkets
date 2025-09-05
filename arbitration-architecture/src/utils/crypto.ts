import { ethers } from 'ethers';
import crypto from 'crypto';

/**
 * Generate a keccak256 hash of data
 */
export function keccak256(data: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(data));
}

/**
 * Generate SHA256 hash
 */
export function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate a random nonce
 */
export function generateNonce(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Verify an Ethereum signature
 */
export function verifySignature(
  message: string,
  signature: string,
  expectedSigner: string
): boolean {
  try {
    const recoveredAddress = ethers.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Sign a message with a private key
 */
export async function signMessage(
  message: string,
  privateKey: string
): Promise<string> {
  const wallet = new ethers.Wallet(privateKey);
  return wallet.signMessage(message);
}

/**
 * Generate evidence root hash from file content
 */
export function generateEvidenceRoot(content: Buffer): string {
  // This would integrate with 0G Storage's merkle tree
  // For now, return a simple hash
  return '0x' + sha256(content.toString());
}

/**
 * Validate Ethereum address
 */
export function isValidAddress(address: string): boolean {
  return ethers.isAddress(address);
}

/**
 * Format address for display
 */
export function formatAddress(address: string): string {
  if (!isValidAddress(address)) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}