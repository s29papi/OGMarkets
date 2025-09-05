import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker';
import { ethers } from 'ethers';
import { createLogger } from '../utils/logger';
import type { EnvConfig } from '../config/env';

const logger = createLogger('0GCompute');

export interface ComputeConfig {
  broker: any; // ZGServingUserBroker type from SDK
  signer: ethers.Signer;
  config: EnvConfig;
}

export interface ServiceInfo {
  provider: string;
  model: string;
  endpoint: string;
  inputPrice: bigint;
  outputPrice: bigint;
  verifiability: 'TeeML' | 'none';
  available: boolean;
}

export interface InferenceRequest {
  provider: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface InferenceResponse {
  content: string;
  model: string;
  provider: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  chatId?: string;
  valid?: boolean;
}

// ============ Compute Factory ============

export async function createComputeClient(
  config: EnvConfig,
  signer: ethers.Signer
): Promise<ComputeConfig> {
  const broker = await createZGComputeNetworkBroker(signer as ethers.Wallet | ethers.JsonRpcSigner);
  
  // Add initial funds to account if needed
  const account = await broker.ledger.getLedger();
  const totalBalance = account.ledgerInfo[0];
  const lockedBalance = account.ledgerInfo[1];
  logger.info('Compute account balance', {
    totalBalance: ethers.formatEther(totalBalance),
    lockedBalance: ethers.formatEther(lockedBalance),
    availableBalance: ethers.formatEther(totalBalance - lockedBalance),
  });
  
  return {
    broker,
    signer,
    config,
  };
}

// ============ Account Management ============

/**
 * Add funds to compute account
 */
export async function addFunds(
  compute: ComputeConfig,
  amount: string
): Promise<void> {
  try {
    await compute.broker.ledger.depositFund(amount);
    logger.info('Funds added to compute account', { amount });
  } catch (error) {
    logger.error('Failed to add funds', error);
    throw error;
  }
}

/**
 * Get account balance
 */
export async function getBalance(compute: ComputeConfig) {
  const ledger = await compute.broker.ledger.getLedger();
  const totalBalance = ledger.ledgerInfo[0];
  const lockedBalance = ledger.ledgerInfo[1];
  return {
    totalBalance: ethers.formatEther(totalBalance),
    lockedBalance: ethers.formatEther(lockedBalance),
    availableBalance: ethers.formatEther(totalBalance - lockedBalance),
  };
}

/**
 * Withdraw funds from account
 */
export async function withdrawFunds(
  compute: ComputeConfig,
  amount: string
): Promise<void> {
  try {
    await compute.broker.ledger.retrieveFund('inference', amount);
    logger.info('Funds withdrawn from compute account', { amount });
  } catch (error) {
    logger.error('Failed to withdraw funds', error);
    throw error;
  }
}

// ============ Service Discovery ============

/**
 * List available AI services
 */
export async function listServices(
  compute: ComputeConfig
): Promise<ServiceInfo[]> {
  const services = await compute.broker.inference.listService();
  
  return services.map((service: any) => ({
    provider: service.provider,
    model: service.model,
    endpoint: service.url,
    inputPrice: service.inputPrice,
    outputPrice: service.outputPrice,
    verifiability: service.verifiability || 'none',
    available: true,
  }));
}

/**
 * Get service by provider address
 */
export async function getService(
  compute: ComputeConfig,
  providerAddress: string
): Promise<ServiceInfo | null> {
  const services = await listServices(compute);
  return services.find(s => s.provider === providerAddress) || null;
}

/**
 * Acknowledge provider before first use
 */
export async function acknowledgeProvider(
  compute: ComputeConfig,
  providerAddress: string
): Promise<void> {
  try {
    await compute.broker.inference.acknowledgeProviderSigner(providerAddress);
    logger.info('Provider acknowledged', { provider: providerAddress });
  } catch (error) {
    logger.error('Failed to acknowledge provider', error);
    throw error;
  }
}

// ============ Inference ============

/**
 * Send inference request to AI model
 */
export async function sendInference(
  compute: ComputeConfig,
  request: InferenceRequest
): Promise<InferenceResponse> {
  try {
    // Get service metadata
    const { endpoint, model } = await compute.broker.inference.getServiceMetadata(
      request.provider
    );
    
    // Prepare the content
    const content = request.messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');
    
    // Generate auth headers
    const headers = await compute.broker.inference.getRequestHeaders(
      request.provider,
      content
    );
    
    // Send request
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        messages: request.messages,
        model: request.model || model,
        temperature: request.temperature || 0.7,
        max_tokens: request.maxTokens || 2048,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Inference request failed: ${response.statusText}`);
    }
    
    const data = await response.json() as {
      id: string;
      choices: Array<{
        message: {
          content: string;
          role?: string;
        };
        index?: number;
        finish_reason?: string;
      }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
      model?: string;
      object?: string;
    };
    
    // Process response for fee settlement and verification
    const chatId = data.id;
    const responseContent = data.choices[0].message.content;
    
    const valid = await compute.broker.inference.processResponse(
      request.provider,
      responseContent,
      chatId
    );
    
    logger.info('Inference completed', {
      provider: request.provider,
      model: model,
      valid,
    });
    
    return {
      content: responseContent,
      model: model,
      provider: request.provider,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
      chatId,
      valid,
    };
  } catch (error) {
    logger.error('Inference failed', error);
    throw error;
  }
}

// ============ Arbitration Specific ============

/**
 * Run arbitration on a wager claim
 */
export async function runArbitration(
  compute: ComputeConfig,
  providerAddress: string,
  claim: string,
  evidence: string,
  sources: string
): Promise<{
  winner: string;
  confidence: number;
  reasoning: string;
}> {
  const systemPrompt = `You are an impartial arbitrator for a prediction market dispute.
Analyze the claim and evidence objectively.
Respond with a JSON object containing:
- winner: "partyA" if claim is true, "partyB" if false
- confidence: confidence level (0-100)
- reasoning: brief explanation of decision`;
  
  const userPrompt = `Claim: "${claim}"
Sources: ${sources}
Evidence: ${evidence}

Determine if the claim is TRUE or FALSE based on the evidence provided.`;
  
  const response = await sendInference(compute, {
    provider: providerAddress,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.1, // Low temperature for consistent factual analysis
  });
  
  try {
    const result = JSON.parse(response.content);
    return {
      winner: result.winner,
      confidence: result.confidence,
      reasoning: result.reasoning,
    };
  } catch (error) {
    logger.error('Failed to parse arbitration response', error);
    throw new Error('Invalid arbitration response format');
  }
}

/**
 * Verify an arbitration result
 */
export async function verifyArbitrationResult(
  compute: ComputeConfig,
  providerAddress: string,
  content: string,
  chatId?: string
): Promise<boolean> {
  if (!chatId) {
    logger.warn('No chatId provided for verification');
    return false;
  }
  
  return compute.broker.inference.processResponse(
    providerAddress,
    content,
    chatId
  );
}