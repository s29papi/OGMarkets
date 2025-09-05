import { ethers } from 'ethers';
import { createLogger } from '../utils/logger';
import type { EnvConfig } from '../config/env';

const logger = createLogger('0GChain');

export interface ChainConfig {
  provider: ethers.JsonRpcProvider;
  signer: ethers.Wallet;
  chainId: bigint;
}

// ============ Chain Factory ============

export async function createChainConnection(
  config: EnvConfig
): Promise<ChainConfig> {
  const provider = new ethers.JsonRpcProvider(config.CHAIN_RPC_URL);
  const signer = new ethers.Wallet(config.PRIVATE_KEY, provider);
  
  const network = await provider.getNetwork();
  const chainId = network.chainId;
  
  logger.info('Connected to 0G Chain', {
    rpc: config.CHAIN_RPC_URL,
    chainId: chainId.toString(),
    signer: await signer.getAddress(),
  });
  
  return {
    provider,
    signer,
    chainId,
  };
}

// ============ Account Functions ============

/**
 * Get account balance
 */
export async function getAccountBalance(
  chain: ChainConfig,
  address?: string
): Promise<string> {
  const targetAddress = address || (await chain.signer.getAddress());
  const balance = await chain.provider.getBalance(targetAddress);
  return ethers.formatEther(balance);
}

/**
 * Get account nonce
 */
export async function getAccountNonce(
  chain: ChainConfig,
  address?: string
): Promise<number> {
  const targetAddress = address || (await chain.signer.getAddress());
  return chain.provider.getTransactionCount(targetAddress);
}

/**
 * Transfer native tokens
 */
export async function transferNative(
  chain: ChainConfig,
  to: string,
  amount: string
): Promise<ethers.TransactionResponse> {
  const tx = await chain.signer.sendTransaction({
    to,
    value: ethers.parseEther(amount),
  });
  
  logger.info('Native transfer sent', {
    to,
    amount,
    txHash: tx.hash,
  });
  
  return tx;
}

// ============ Transaction Functions ============

/**
 * Wait for transaction confirmation
 */
export async function waitForTransaction(
  chain: ChainConfig,
  txHash: string,
  confirmations: number = 1
): Promise<ethers.TransactionReceipt | null> {
  logger.info('Waiting for transaction', { txHash, confirmations });
  
  const receipt = await chain.provider.waitForTransaction(
    txHash,
    confirmations
  );
  
  if (receipt) {
    logger.info('Transaction confirmed', {
      txHash,
      blockNumber: receipt.blockNumber,
      status: receipt.status,
    });
  }
  
  return receipt;
}

/**
 * Get transaction receipt
 */
export async function getTransactionReceipt(
  chain: ChainConfig,
  txHash: string
): Promise<ethers.TransactionReceipt | null> {
  return chain.provider.getTransactionReceipt(txHash);
}

/**
 * Estimate gas for transaction
 */
export async function estimateGas(
  chain: ChainConfig,
  tx: ethers.TransactionRequest
): Promise<bigint> {
  return chain.provider.estimateGas(tx);
}

/**
 * Get current gas price
 */
export async function getGasPrice(chain: ChainConfig): Promise<bigint> {
  const feeData = await chain.provider.getFeeData();
  return feeData.gasPrice || BigInt(0);
}

// ============ Block Functions ============

/**
 * Get current block number
 */
export async function getBlockNumber(chain: ChainConfig): Promise<number> {
  return chain.provider.getBlockNumber();
}

/**
 * Get block by number or hash
 */
export async function getBlock(
  chain: ChainConfig,
  blockHashOrNumber: string | number
): Promise<ethers.Block | null> {
  return chain.provider.getBlock(blockHashOrNumber);
}

/**
 * Subscribe to new blocks
 */
export function onBlock(
  chain: ChainConfig,
  callback: (blockNumber: number) => void
): void {
  chain.provider.on('block', callback);
}

/**
 * Unsubscribe from block events
 */
export function offBlock(
  chain: ChainConfig,
  callback?: (blockNumber: number) => void
): void {
  if (callback) {
    chain.provider.off('block', callback);
  } else {
    chain.provider.removeAllListeners('block');
  }
}

// ============ Contract Interaction ============

/**
 * Deploy a contract
 */
export async function deployContract(
  chain: ChainConfig,
  abi: any[],
  bytecode: string,
  ...args: any[]
): Promise<ethers.BaseContract> {
  const factory = new ethers.ContractFactory(abi, bytecode, chain.signer);
  const contract = await factory.deploy(...args);
  
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  
  logger.info('Contract deployed', { address });
  
  return contract;
}

/**
 * Get contract instance
 */
export function getContract(
  chain: ChainConfig,
  address: string,
  abi: any[]
): ethers.Contract {
  return new ethers.Contract(address, abi, chain.signer);
}

/**
 * Call contract method (read-only)
 */
export async function callContract(
  chain: ChainConfig,
  address: string,
  abi: any[],
  method: string,
  ...args: any[]
): Promise<any> {
  const contract = getContract(chain, address, abi);
  return contract[method](...args);
}

// ============ Token Functions ============

/**
 * Get ERC20 token balance
 */
export async function getTokenBalance(
  chain: ChainConfig,
  tokenAddress: string,
  accountAddress?: string
): Promise<string> {
  const erc20Abi = [
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)',
  ];
  
  const contract = getContract(chain, tokenAddress, erc20Abi);
  const address = accountAddress || (await chain.signer.getAddress());
  
  const [balance, decimals] = await Promise.all([
    contract.balanceOf(address),
    contract.decimals(),
  ]);
  
  return ethers.formatUnits(balance, decimals);
}

/**
 * Approve ERC20 token spending
 */
export async function approveToken(
  chain: ChainConfig,
  tokenAddress: string,
  spenderAddress: string,
  amount: string
): Promise<ethers.TransactionResponse> {
  const erc20Abi = [
    'function approve(address spender, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)',
  ];
  
  const contract = getContract(chain, tokenAddress, erc20Abi);
  const decimals = await contract.decimals();
  const amountWei = ethers.parseUnits(amount, decimals);
  
  const tx = await contract.approve(spenderAddress, amountWei);
  
  logger.info('Token approval sent', {
    token: tokenAddress,
    spender: spenderAddress,
    amount,
    txHash: tx.hash,
  });
  
  return tx;
}

/**
 * Transfer ERC20 tokens
 */
export async function transferToken(
  chain: ChainConfig,
  tokenAddress: string,
  to: string,
  amount: string
): Promise<ethers.TransactionResponse> {
  const erc20Abi = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)',
  ];
  
  const contract = getContract(chain, tokenAddress, erc20Abi);
  const decimals = await contract.decimals();
  const amountWei = ethers.parseUnits(amount, decimals);
  
  const tx = await contract.transfer(to, amountWei);
  
  logger.info('Token transfer sent', {
    token: tokenAddress,
    to,
    amount,
    txHash: tx.hash,
  });
  
  return tx;
}

// ============ Utility Functions ============

/**
 * Format wei to ether
 */
export function formatEther(wei: bigint | string): string {
  return ethers.formatEther(wei);
}

/**
 * Parse ether to wei
 */
export function parseEther(ether: string): bigint {
  return ethers.parseEther(ether);
}

/**
 * Validate address
 */
export function isValidAddress(address: string): boolean {
  return ethers.isAddress(address);
}

/**
 * Get checksum address
 */
export function getChecksumAddress(address: string): string {
  return ethers.getAddress(address);
}