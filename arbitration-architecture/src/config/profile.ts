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

export const PROFILES: Record<string, ArbitrationProfile> = {
  'llama-factcheck': {
    id: 'llama-factcheck',
    name: 'Llama 3.3 Fact Checker',
    description: 'High-accuracy fact checking using Llama 3.3 70B model',
    model: 'llama-3.3-70b-instruct',
    provider: '0xf07240Efa67755B5311bc75784a061eDB47165Dd',
    confidenceThresholdBps: 8000, // 80% confidence required
    m: 2, // need 2 out of 3 arbitrators
    n: 3,
    arbitrators: [ // ✅ Make sure this exists
      '0x1234567890123456789012345678901234567890',
      '0x2345678901234567890123456789012345678901',
      '0x3456789012345678901234567890123456789012'
    ],
    verificationMode: 'TeeML',
    inputPricePerToken: BigInt(1000),
    outputPricePerToken: BigInt(2000),
  },
  
  'deepseek-reasoning': {
    id: 'deepseek-reasoning',
    name: 'DeepSeek Advanced Reasoning',
    description: 'Complex reasoning for nuanced disputes',
    model: 'deepseek-r1-70b',
    provider: '0x3feE5a4dd5FDb8a32dDA97Bed899830605dBD9D3',
    confidenceThresholdBps: 7000, // 70% confidence (more complex = lower threshold)
    m: 2,
    n: 3,
        arbitrators: [ // ✅ Make sure this exists
      '0x1234567890123456789012345678901234567890',
      '0x2345678901234567890123456789012345678901',
      '0x3456789012345678901234567890123456789012'
    ],
    verificationMode: 'TeeML',
    inputPricePerToken: BigInt(1500),
    outputPricePerToken: BigInt(3000),
  },
  
  'quick-consensus': {
    id: 'quick-consensus',
    name: 'Quick Consensus',
    description: 'Fast resolution for simple binary outcomes',
    model: 'llama-3.3-70b-instruct',
    provider: '0xf07240Efa67755B5311bc75784a061eDB47165Dd',
    confidenceThresholdBps: 9000, // 90% confidence for simple cases
    m: 1, // only need 1 arbitrator for simple cases
    n: 1,
        arbitrators: [ // ✅ Make sure this exists
      '0x1234567890123456789012345678901234567890',
      '0x2345678901234567890123456789012345678901',
      '0x3456789012345678901234567890123456789012'
    ],
    verificationMode: 'TeeML',
    inputPricePerToken: BigInt(800),
    outputPricePerToken: BigInt(1600),
  },
  
  'high-stakes': {
    id: 'high-stakes',
    name: 'High Stakes Arbitration',
    description: 'Maximum security for high-value wagers',
    model: 'deepseek-r1-70b',
    provider: '0x3feE5a4dd5FDb8a32dDA97Bed899830605dBD9D3',
    confidenceThresholdBps: 8500, // 85% confidence
    m: 3, // need 3 out of 5 arbitrators
    n: 5,
        arbitrators: [ // ✅ Make sure this exists
      '0x1234567890123456789012345678901234567890',
      '0x2345678901234567890123456789012345678901',
      '0x3456789012345678901234567890123456789012'
    ],
    verificationMode: 'TeeML',
    inputPricePerToken: BigInt(2000),
    outputPricePerToken: BigInt(4000),
  },
};

export function getProfile(profileId: string): ArbitrationProfile | undefined {
  return PROFILES[profileId];
}

export function getDefaultProfile(): ArbitrationProfile {
  return PROFILES['llama-factcheck'];
}

export function validateProfile(profile: Partial<ArbitrationProfile>): boolean {
  if (!profile.m || !profile.n) return false;
  if (profile.m > profile.n) return false;
  if (!profile.confidenceThresholdBps || profile.confidenceThresholdBps > 10000) return false;
  if (!profile.provider || !profile.model) return false;
  return true;
}