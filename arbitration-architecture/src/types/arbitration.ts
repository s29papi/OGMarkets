// In src/types/arbitration.ts - add the missing property
export interface ArbitrationProfile {
  id: string;
  name: string;
  description: string;
  model: string;
  provider: string;
  confidenceThresholdBps: number;
  m: number; // required votes
  n: number; // total arbitrators
  arbitrators: string[]; // ✅ Add this missing property
  verificationMode: 'TeeML' | 'none';
  inputPricePerToken: bigint;
  outputPricePerToken: bigint;
}
export interface ArbitrationRequest {
  wagerId: string;
  claim: string;
  evidence: string;
  sources: string;
  profileId: string;
  partyA: string;
  partyB: string;
}

export interface ArbitrationResult {
  wagerId: string;
  winner: string;
  confidenceBps: number;
  reasoning: string;
  modelUsed: string;
  provider: string;
  timestamp: number;
}

export interface ArbitrationReceipt {
  wagerId: string;
  winner: string;
  confidenceBps: number;
  traceURI: string;
  timestamp: number;
  signature?: string;
  arbitrator?: string;
}

export interface ArbitrationJob {
  id: string;
  wagerId: string;
  provider: string;
  model: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempt: number;
  maxAttempts: number;
  result?: ArbitrationResult;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface ConsensusState {
  wagerId: string;
  votesForA: number;
  votesForB: number;
  requiredVotes: number;
  totalArbitrators: number;
  receipts: ArbitrationReceipt[];
  resolved: boolean;
  winner?: string;
}

export interface ComputeServiceInfo {
  provider: string;
  model: string;
  endpoint: string;
  inputPrice: bigint;
  outputPrice: bigint;
  verifiability: 'TeeML' | 'none';
  available: boolean;
}