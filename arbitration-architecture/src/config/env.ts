import { z } from 'zod';

const envSchema = z.object({
  // 0G Chain Configuration
  CHAIN_RPC_URL: z.string().url().default('https://evmrpc-testnet.0g.ai'),
  PRIVATE_KEY: z.string().min(64).max(66), // with or without 0x prefix
  
  // 0G Storage Configuration
  STORAGE_INDEXER_RPC: z.string().url().default('https://indexer-storage-testnet-turbo.0g.ai'),
  
  // 0G Compute Configuration
  COMPUTE_PROVIDER_LLAMA: z.string().default('0xf07240Efa67755B5311bc75784a061eDB47165Dd'),
  COMPUTE_PROVIDER_DEEPSEEK: z.string().default('0x3feE5a4dd5FDb8a32dDA97Bed899830605dBD9D3'),
  
  // Smart Contract
  JUDGE_CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  
  // API Configuration
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  
  // Redis Configuration
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  
  // Arbitration Settings
  DEFAULT_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(10000).default(8000),
  DEFAULT_M_OF_N: z.coerce.number().min(1).default(2),
  DEFAULT_N_ARBITRATORS: z.coerce.number().min(1).default(3),
  RETRY_ATTEMPTS: z.coerce.number().min(1).default(3),
  RETRY_DELAY_MS: z.coerce.number().min(1000).default(5000),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(): EnvConfig {
  try {
    const config = envSchema.parse(process.env);
    
    // Additional validation
    if (config.DEFAULT_M_OF_N > config.DEFAULT_N_ARBITRATORS) {
      throw new Error('DEFAULT_M_OF_N cannot be greater than DEFAULT_N_ARBITRATORS');
    }
    
    // Strip 0x prefix from private key if present
    if (config.PRIVATE_KEY.startsWith('0x')) {
      config.PRIVATE_KEY = config.PRIVATE_KEY.slice(2);
    }
    
    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    } else {
      console.error('❌ Environment validation error:', error);
    }
    process.exit(1);
  }
}