export enum WagerSide {
  A = 0,
  B = 1,
}

export enum WagerStatus {
  CREATED = 'CREATED',
  FUNDED_A = 'FUNDED_A',
  FUNDED_B = 'FUNDED_B',
  FULLY_FUNDED = 'FULLY_FUNDED',
  ARBITRATING = 'ARBITRATING',
  RESOLVED = 'RESOLVED',
  DISPUTED = 'DISPUTED',
}

export interface Wager {
  id: string;
  partyA: string;
  partyB: string;
  token: string;
  stakeARequired: string; // wei amount as string
  stakeBRequired: string; // wei amount as string
  claim: string;
  sources: string;
  evidenceRoot?: string;
  evidenceURI?: string;
  fundedA: boolean;
  fundedB: boolean;
  resolved: boolean;
  winner?: string;
  winningConfidenceBps?: number;
  status: WagerStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWagerRequest {
  partyB: string;
  token: string;
  stakeA: string;
  stakeB: string;
  claim: string;
  sources: string;
  profileId: string; // arbitration profile to use
}

export interface FundWagerRequest {
  wagerId: string;
  side: WagerSide;
}

export interface WagerEvidence {
  wagerId: string;
  rootHash: string;
  uri: string;
  uploadedBy: string;
  timestamp: Date;
}