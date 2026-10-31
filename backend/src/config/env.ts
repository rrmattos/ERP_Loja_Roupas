import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  APP_MODE: z.enum(['portfolio_sandbox', 'commercial_production']).default('portfolio_sandbox'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(10, 'DATABASE_URL é obrigatória'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET deve ter no mínimo 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET deve ter no mínimo 32 caracteres'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  ADMIN_EMAIL: z.string().email('ADMIN_EMAIL inválido no arquivo .env'),
  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD deve ter no mínimo 8 caracteres no arquivo .env'),
  UNITY_DEFAULT_API_KEY: z.string().min(16, 'UNITY_DEFAULT_API_KEY deve ter no mínimo 16 caracteres no arquivo .env'),
  SANDBOX_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  SANDBOX_MAX_PRODUCTS: z.coerce.number().int().min(2).max(100).default(15),
  MAX_UPLOAD_SIZE_KB: z.coerce.number().int().min(50).max(3072).default(3072),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Erro crítico nas variáveis de ambiente:', parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsedEnv.data,
  isProduction: parsedEnv.data.NODE_ENV === 'production',
  isStaging: parsedEnv.data.NODE_ENV === 'staging',
  isDevelopment: parsedEnv.data.NODE_ENV === 'development',
  isPortfolioSandbox: parsedEnv.data.APP_MODE === 'portfolio_sandbox',
  allowedOrigins: parsedEnv.data.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
};

