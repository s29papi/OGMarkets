/**
 * Core service initialization and registry
 */
import { ethers } from 'ethers';
import { validateEnv } from '../config/env';
import { logger } from '../utils/logger';
import { createJudgeContract } from '../contracts/judge';
import { createEIP712Signer } from '../contracts/signer';
import { createStorageClient } from '../integrations/storage';
import { createComputeClient } from '../integrations/compute';
import { createChainConnection } from '../integrations/chain';
import type { JudgeContract } from '../contracts/judge';
import type { SignerConfig } from '../contracts/signer';
import type { StorageConfig } from '../integrations/storage';
import type { ComputeConfig } from '../integrations/compute';
import type { ChainConfig } from '../integrations/chain';
export interface ServiceRegistry {
  judge: JudgeContract;
  signer: SignerConfig;
  storage: StorageConfig;
  compute: ComputeConfig;
  chain: ChainConfig;
  provider: ethers.JsonRpcProvider;
  wallet: ethers.Wallet;
}

let services: ServiceRegistry | null = null;

/**
 * Initialize all services
 */
export async function initializeServices(): Promise<ServiceRegistry> {
  if (services) {
    return services;
  }

  logger.info('Initializing services...');
  
  try {
    const config = validateEnv();
    
    // Create provider and wallet
    const provider = new ethers.JsonRpcProvider(config.CHAIN_RPC_URL);
    const wallet = new ethers.Wallet(config.PRIVATE_KEY, provider);
    
    logger.info('Created wallet', { 
      address: wallet.address,
      rpcUrl: config.CHAIN_RPC_URL 
    });

    // Initialize smart contract services
    const judge = createJudgeContract(config.JUDGE_CONTRACT_ADDRESS, wallet);
    const signer = await createEIP712Signer(wallet, config.JUDGE_CONTRACT_ADDRESS);
    
    // Initialize 0G services
    const storage = createStorageClient(config, wallet);
    const compute = await createComputeClient(config, wallet);
    const chain = await createChainConnection(config);
    
    services = {
      judge,
      signer,
      storage,
      compute,
      chain,
      provider,
      wallet
    };

    logger.info('All services initialized successfully');
    return services;
    
  } catch (error) {
    logger.error('Failed to initialize services', error);
    throw error;
  }
}

/**
 * Get initialized services (throws if not initialized)
 */
export function getServices(): ServiceRegistry {
  if (!services) {
    throw new Error('Services not initialized. Call initializeServices() first.');
  }
  return services;
}

/**
 * Shutdown services and cleanup
 */
export async function shutdownServices(): Promise<void> {
  if (!services) {
    return;
  }

  logger.info('Shutting down services...');
  
  try {
    // Cleanup any persistent connections
    services = null;
    logger.info('Services shutdown complete');
  } catch (error) {
    logger.error('Error during service shutdown', error);
    throw error;
  }
}

/**
 * Health check for all services
 */
export async function checkServiceHealth(): Promise<Record<string, boolean>> {
  const health: Record<string, boolean> = {};
  
  if (!services) {
    return { initialized: false };
  }

  try {
    // Check blockchain connection
    health.blockchain = true;
    await services.provider.getBlockNumber();
    
    // Check contract connection
    health.contract = true;
    await services.judge.contract.nextWagerId();
    
    // Check wallet balance
    health.wallet = true;
    const balance = await services.provider.getBalance(services.wallet.address);
    health.sufficientBalance = balance > ethers.parseEther('0.01');
    
    // Check 0G services
    health.storage = true; // Storage client is connection-less
    health.compute = services.compute !== null;
    health.chain = services.chain !== null;
    
  } catch (error) {
    logger.error('Health check failed', error);
    health.error = true;
  }

  return health;
}