export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  responseFormat: 'json' | 'text';
}

export const MODELS: Record<string, ModelConfig> = {
  'llama-3.3-70b-instruct': {
    id: 'llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B Instruct',
    provider: '0xf07240Efa67755B5311bc75784a061eDB47165Dd',
    maxTokens: 2048,
    temperature: 0.1, // Low temperature for factual accuracy
    systemPrompt: `You are an impartial arbitrator for a prediction market dispute. 
    Analyze the claim and evidence objectively. 
    Respond with a JSON object containing:
    - winner: address of the winning party
    - confidence: confidence level (0-100)
    - reasoning: brief explanation of decision`,
    responseFormat: 'json',
  },
  
  'deepseek-r1-70b': {
    id: 'deepseek-r1-70b',
    name: 'DeepSeek R1 70B',
    provider: '0x3feE5a4dd5FDb8a32dDA97Bed899830605dBD9D3',
    maxTokens: 4096,
    temperature: 0.3, // Slightly higher for reasoning
    systemPrompt: `You are an expert arbitrator specializing in complex reasoning.
    Carefully analyze all aspects of the dispute, considering nuance and context.
    Provide a detailed chain of reasoning before reaching your conclusion.
    Respond with a JSON object containing:
    - winner: address of the winning party
    - confidence: confidence level (0-100)
    - reasoning: detailed explanation with step-by-step logic`,
    responseFormat: 'json',
  },
};

export function getModelConfig(modelId: string): ModelConfig | undefined {
  return MODELS[modelId];
}

// Prompt templates for different dispute types
export const PROMPT_TEMPLATES = {
  factCheck: (claim: string, evidence: string) => `
    Claim to verify: "${claim}"
    
    Evidence provided:
    ${evidence}
    
    Task: Determine if the claim is TRUE (party A wins) or FALSE (party B wins).
    Base your decision solely on the evidence provided.
    Return confidence as a percentage (0-100).
  `,
  
  prediction: (prediction: string, outcome: string, sources: string) => `
    Prediction: "${prediction}"
    
    Actual outcome: "${outcome}"
    
    Data sources: ${sources}
    
    Task: Determine if the prediction was CORRECT (party A wins) or INCORRECT (party B wins).
    Verify the outcome against the provided sources.
    Return confidence as a percentage (0-100).
  `,
  
  sports: (game: string, predictedWinner: string, actualResult: string) => `
    Game: "${game}"
    
    Predicted winner: "${predictedWinner}"
    
    Actual result: "${actualResult}"
    
    Task: Determine if the prediction was CORRECT (party A wins) or INCORRECT (party B wins).
    Consider only the final score/result.
    Return confidence as a percentage (0-100).
  `,
};