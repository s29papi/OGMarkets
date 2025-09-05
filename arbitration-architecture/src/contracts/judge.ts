import { ethers } from 'ethers';
import { createLogger } from '../utils/logger';
import ZeroGravityJudgeABI from './abi/ZeroGravityJudge.json';
import type { 
  Wager, 
  CreateWagerRequest, 
  WagerSide,
  ArbitrationReceipt 
} from '../types';

const logger = createLogger('JudgeContract');

export interface JudgeContract {
  contract: ethers.Contract;
  provider: ethers.Provider;
  signer?: ethers.Signer;
  address: string;
}

// ============ Contract Factory ============

export function createJudgeContract(
  contractAddress: string,
  providerOrSigner: ethers.Provider | ethers.Signer
): JudgeContract {
  const provider = 
    'provider' in providerOrSigner 
      ? providerOrSigner.provider! 
      : providerOrSigner;
  
  const signer = 'provider' in providerOrSigner 
    ? providerOrSigner as ethers.Signer 
    : undefined;

  const contract = new ethers.Contract(
    contractAddress,
    ZeroGravityJudgeABI,
    signer || provider
  );

  return {
    contract,
    provider,
    signer,
    address: contractAddress,
  };
}

// ============ Read Methods ============

export async function getWagerCore(judge: JudgeContract, wagerId: string) {
  const result = await judge.contract.getWagerCore(wagerId);
  return {
    partyA: result[0],
    partyB: result[1],
    token: result[2],
    stakeARequired: result[3].toString(),
    stakeBRequired: result[4].toString(),
    fundedA: result[5],
    fundedB: result[6],
    resolved: result[7],
    winner: result[8],
    winningConfidenceBps: Number(result[9]),
  };
}

export async function getWagerMeta(judge: JudgeContract, wagerId: string) {
  const result = await judge.contract.getWagerMeta(wagerId);
  return {
    evidenceRoot: result[0],
    evidenceURI: result[1],
    claim: result[2],
    sources: result[3],
  };
}

export async function getWagerProfile(judge: JudgeContract, wagerId: string) {
  const result = await judge.contract.getWagerProfile(wagerId);
  return {
    confidenceThresholdBps: Number(result[0]),
    m: Number(result[1]),
    n: Number(result[2]),
    arbitrators: result[3],
  };
}

export async function getWagerVotes(judge: JudgeContract, wagerId: string) {
  const result = await judge.contract.getWagerVotes(wagerId);
  return {
    votesForA: result[0].toString(),
    votesForB: result[1].toString(),
  };
}

export async function getNextWagerId(judge: JudgeContract): Promise<string> {
  const id = await judge.contract.nextWagerId();
  return id.toString();
}

export async function getArbitrationReceiptTypehash(judge: JudgeContract): Promise<string> {
  return judge.contract.ARBITRATION_RECEIPT_TYPEHASH();
}

export async function getReceiptDigest(
  judge: JudgeContract,
  receipt: ArbitrationReceipt
): Promise<string> {
  return judge.contract.receiptDigest(receipt);
}

// ============ Write Methods ============

export async function createWager(
  judge: JudgeContract,
  request: CreateWagerRequest,
  profile: { 
    m: number; 
    n: number; 
    arbitrators: string[];
    confidenceThresholdBps: number;
  }
): Promise<ethers.ContractTransactionResponse> {
  if (!judge.signer) {
    throw new Error('Signer required for write operations');
  }

  const tx = await judge.contract.createWager(
    request.partyB,
    request.token,
    ethers.parseEther(request.stakeA),
    ethers.parseEther(request.stakeB),
    request.claim,
    request.sources,
    profile.confidenceThresholdBps,
    profile.m,
    profile.arbitrators
  );

  logger.info('Creating wager', { txHash: tx.hash });
  return tx;
}

export async function fundEscrow(
  judge: JudgeContract,
  wagerId: string,
  side: WagerSide
): Promise<ethers.ContractTransactionResponse> {
  if (!judge.signer) {
    throw new Error('Signer required for write operations');
  }

  const tx = await judge.contract.fundEscrow(wagerId, side);
  logger.info('Funding escrow', { wagerId, side, txHash: tx.hash });
  return tx;
}

export async function attachEvidence(
  judge: JudgeContract,
  wagerId: string,
  rootHash: string,
  uri: string
): Promise<ethers.ContractTransactionResponse> {
  if (!judge.signer) {
    throw new Error('Signer required for write operations');
  }

  const tx = await judge.contract.attachEvidence(wagerId, rootHash, uri);
  logger.info('Attaching evidence', { wagerId, rootHash, txHash: tx.hash });
  return tx;
}

export async function submitReceipt(
  judge: JudgeContract,
  receipt: ArbitrationReceipt,
  signature: string
): Promise<ethers.ContractTransactionResponse> {
  if (!judge.signer) {
    throw new Error('Signer required for write operations');
  }

  const tx = await judge.contract.submitReceipt(receipt, signature);
  logger.info('Submitting receipt', { 
    wagerId: receipt.wagerId, 
    winner: receipt.winner,
    txHash: tx.hash 
  });
  return tx;
}

// ============ Event Listeners ============

export function onWagerCreated(
  judge: JudgeContract,
  callback: (id: string, partyA: string, partyB: string, event: any) => void
) {
  judge.contract.on('WagerCreated', (id, partyA, partyB, ...args) => {
    callback(id.toString(), partyA, partyB, args);
  });
}

export function onEscrowFunded(
  judge: JudgeContract,
  callback: (id: string, party: string, amount: string, event: any) => void
) {
  judge.contract.on('EscrowFunded', (id, party, amount, event) => {
    callback(id.toString(), party, amount.toString(), event);
  });
}

export function onEvidenceAttached(
  judge: JudgeContract,
  callback: (id: string, root: string, uri: string, event: any) => void
) {
  judge.contract.on('EvidenceAttached', (id, root, uri, event) => {
    callback(id.toString(), root, uri, event);
  });
}

export function onReceiptAccepted(
  judge: JudgeContract,
  callback: (
    id: string,
    arbitrator: string,
    winner: string,
    confidenceBps: number,
    traceURI: string,
    event: any
  ) => void
) {
  judge.contract.on(
    'ReceiptAccepted',
    (id, arbitrator, winner, confidenceBps, traceURI, event) => {
      callback(
        id.toString(),
        arbitrator,
        winner,
        Number(confidenceBps),
        traceURI,
        event
      );
    }
  );
}

export function onResolved(
  judge: JudgeContract,
  callback: (
    id: string,
    winner: string,
    confidenceBps: number,
    event: any
  ) => void
) {
  judge.contract.on('Resolved', (id, winner, confidenceBps, event) => {
    callback(id.toString(), winner, Number(confidenceBps), event);
  });
}

export function onPayout(
  judge: JudgeContract,
  callback: (id: string, winner: string, amount: string, event: any) => void
) {
  judge.contract.on('Payout', (id, winner, amount, event) => {
    callback(id.toString(), winner, amount.toString(), event);
  });
}

export function removeAllListeners(judge: JudgeContract) {
  judge.contract.removeAllListeners();
}

// ============ Helper Methods ============

export async function waitForTransaction(
  judge: JudgeContract,
  txHash: string,
  confirmations = 1
): Promise<ethers.TransactionReceipt | null> {
  return judge.provider.waitForTransaction(txHash, confirmations);
}

export async function estimateGas(
  judge: JudgeContract,
  method: string,
  ...args: any[]
): Promise<bigint> {
  if (!judge.signer) {
    throw new Error('Signer required for gas estimation');
  }
  return judge.contract[method].estimateGas(...args);
}

export async function getChainId(judge: JudgeContract): Promise<bigint> {
  const network = await judge.provider.getNetwork();
  return network.chainId;
}