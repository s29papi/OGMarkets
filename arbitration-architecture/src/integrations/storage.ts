import { Indexer, ZgFile, getFlowContract, MemData } from '@0glabs/0g-ts-sdk';
import { ethers } from 'ethers';
import { createLogger } from '../utils/logger';
import type { EnvConfig } from '../config/env';

const logger = createLogger('0GStorage');

export interface StorageConfig {
  indexer: Indexer;
  signer: ethers.Wallet;
  evmRpc: string;
}

// ============ Storage Factory ============

export function createStorageClient(
  config: EnvConfig,
  signer: ethers.Wallet
): StorageConfig {
  const indexer = new Indexer(config.STORAGE_INDEXER_RPC);
  
  return {
    indexer,
    signer,
    evmRpc: config.CHAIN_RPC_URL,
  };
}

// ============ Upload Functions ============

/**
 * Upload a file to 0G Storage
 */
export async function uploadFile(
  storage: StorageConfig,
  filePath: string
): Promise<{ rootHash: string; txHash: string }> {
  try {
    // Create file object
    const file = await ZgFile.fromFilePath(filePath);
    
    // Get merkle tree
    const [tree, treeErr] = await file.merkleTree();
    if (treeErr !== null) {
      await file.close();
      throw new Error(`Failed to generate merkle tree: ${treeErr}`);
    }
    
    if (!tree) {
      await file.close();
      throw new Error('Merkle tree is null');
    }
    
    const rootHash = tree.rootHash();
    if (!rootHash) {
      await file.close();
      throw new Error('Root hash is null');
    }
    const rootHashString = rootHash.toString();
    logger.info('Generated file root hash', { rootHash: rootHashString });
    
    // Upload to storage network
    const [tx, uploadErr] = await storage.indexer.upload(
      file,
      storage.evmRpc,
      storage.signer
    );
    
    await file.close();
    
    if (uploadErr !== null) {
      throw new Error(`Upload failed: ${uploadErr}`);
    }
    
    logger.info('File uploaded successfully', { 
      rootHash: rootHashString, 
      txHash: tx 
    });
    
    return { 
      rootHash: rootHashString, 
      txHash: tx 
    };
  } catch (error) {
    logger.error('Failed to upload file', error);
    throw error;
  }
}

/**
 * Upload buffer data to 0G Storage
 */
export async function uploadBuffer(
  storage: StorageConfig,
  data: Buffer,
  fileName: string = 'data.bin'
): Promise<{ rootHash: string; txHash: string }> {
  try {
    // Create file from buffer using MemData
    const file = new MemData(data);
    
    // Get merkle tree
    const [tree, treeErr] = await file.merkleTree();
    if (treeErr !== null) {
      throw new Error(`Failed to generate merkle tree: ${treeErr}`);
    }
    
    if (!tree) {
      throw new Error('Merkle tree is null');
    }
    
    const rootHash = tree.rootHash();
    if (!rootHash) {
      throw new Error('Root hash is null');
    }
    const rootHashString = rootHash.toString();
    logger.info('Generated buffer root hash', { rootHash: rootHashString });
    
    // Upload to storage network
    const [tx, uploadErr] = await storage.indexer.upload(
      file,
      storage.evmRpc,
      storage.signer
    );
    
    if (uploadErr !== null) {
      throw new Error(`Upload failed: ${uploadErr}`);
    }
    
    logger.info('Buffer uploaded successfully', { 
      rootHash: rootHashString, 
      txHash: tx 
    });
    
    return { 
      rootHash: rootHashString, 
      txHash: tx 
    };
  } catch (error) {
    logger.error('Failed to upload buffer', error);
    throw error;
  }
}

/**
 * Upload JSON data to 0G Storage
 */
export async function uploadJSON(
  storage: StorageConfig,
  data: any
): Promise<{ rootHash: string; txHash: string }> {
  const jsonString = JSON.stringify(data, null, 2);
  const buffer = Buffer.from(jsonString, 'utf-8');
  return uploadBuffer(storage, buffer, 'data.json');
}

// ============ Download Functions ============

/**
 * Download a file from 0G Storage
 */
export async function downloadFile(
  storage: StorageConfig,
  rootHash: string,
  outputPath: string,
  withProof: boolean = true
): Promise<void> {
  try {
    const err = await storage.indexer.download(
      rootHash,
      outputPath,
      withProof
    );
    
    if (err !== null) {
      throw new Error(`Download failed: ${err}`);
    }
    
    logger.info('File downloaded successfully', { 
      rootHash, 
      outputPath 
    });
  } catch (error) {
    logger.error('Failed to download file', error);
    throw error;
  }
}

/**
 * Download file as buffer
 */
export async function downloadToBuffer(
  storage: StorageConfig,
  rootHash: string,
  withProof: boolean = true
): Promise<Buffer> {
  try {
    // Download to temporary location
    const tempPath = `/tmp/0g_download_${Date.now()}`;
    
    const err = await storage.indexer.download(
      rootHash,
      tempPath,
      withProof
    );
    
    if (err !== null) {
      throw new Error(`Download failed: ${err}`);
    }
    
    // Read file into buffer
    const fs = await import('fs');
    const buffer = fs.readFileSync(tempPath);
    
    // Clean up temp file
    fs.unlinkSync(tempPath);
    
    logger.info('File downloaded to buffer', { rootHash });
    return buffer;
  } catch (error) {
    logger.error('Failed to download to buffer', error);
    throw error;
  }
}

/**
 * Download and parse JSON data
 */
export async function downloadJSON(
  storage: StorageConfig,
  rootHash: string,
  withProof: boolean = true
): Promise<any> {
  const buffer = await downloadToBuffer(storage, rootHash, withProof);
  const jsonString = buffer.toString('utf-8');
  return JSON.parse(jsonString);
}

// ============ Helper Functions ============

/**
 * Calculate root hash for a file without uploading
 */
export async function calculateRootHash(filePath: string): Promise<string> {
  const file = await ZgFile.fromFilePath(filePath);
  const [tree, err] = await file.merkleTree();
  await file.close();
  
  if (err !== null) {
    throw new Error(`Failed to calculate root hash: ${err}`);
  }
  
  if (!tree) {
    throw new Error('Merkle tree is null');
  }
  
  const rootHash = tree.rootHash();
  if (!rootHash) {
    throw new Error('Root hash is null');
  }
  
  return rootHash.toString();
}

/**
 * Calculate root hash for buffer data
 */
export async function calculateBufferRootHash(
  data: Buffer,
  fileName: string = 'data.bin'
): Promise<string> {
  const file = new MemData(data);
  const [tree, err] = await file.merkleTree();
  
  if (err !== null) {
    throw new Error(`Failed to calculate root hash: ${err}`);
  }
  
  if (!tree) {
    throw new Error('Merkle tree is null');
  }
  
  const rootHash = tree.rootHash();
  if (!rootHash) {
    throw new Error('Root hash is null');
  }
  
  return rootHash.toString();
}

/**
 * Verify file integrity by comparing root hashes
 */
export async function verifyFileIntegrity(
  filePath: string,
  expectedRootHash: string
): Promise<boolean> {
  try {
    const actualRootHash = await calculateRootHash(filePath);
    const isValid = actualRootHash === expectedRootHash;
    
    logger.info('File integrity check', {
      filePath,
      expectedRootHash,
      actualRootHash,
      isValid
    });
    
    return isValid;
  } catch (error) {
    logger.error('Failed to verify file integrity', error);
    return false;
  }
}

/**
 * Get storage contract information
 */
export async function getStorageContract(
  address: string,
  signer: ethers.Signer
): Promise<ReturnType<typeof getFlowContract>> {
  return getFlowContract(address, signer);
}
