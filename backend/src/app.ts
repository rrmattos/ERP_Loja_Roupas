import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import hpp from 'hpp';
import path from 'path';
import { checkDatabaseConnection } from './config/database';
import { env } from './config/env';
import { authRouter } from './modules/auth/auth.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { ordersRouter } from './modules/orders/orders.routes';
import { productsRouter } from './modules/products/products.routes';
import { unityRouter } from './modules/unity/unity.routes';
import { errorHandler } from './shared/middlewares/errorHandler';
import { globalRateLimiter } from './shared/middlewares/rateLimiter';

export const app = express();

// Necessário para obter o IP real do visitante atrás do Caddy Server (Reverse Proxy)
app.set('trust proxy', 1);

// 1. Headers de Segurança HTTP (OWASP)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// 2. CORS restrito às origens autorizadas
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || env.allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Origem bloqueada pela política de CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Unity-Api-Key',
      'X-Tenant-Slug',
    ],
  })
);

// 3. Limite estrito de tamanho de payload JSON (1MB para suportar upload WebP comprimido de até 500KB) + Cookies + HPP
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));
app.use(cookieParser());
app.use(hpp());

// 4. Rate Limiting global
app.use('/api', globalRateLimiter);

// 5. Servir imagens de upload estáticas com proteção nosniff
const uploadsPath = path.resolve(process.cwd(), 'uploads');
app.use(
  '/uploads',
  (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    next();
  },
  express.static(uploadsPath)
);

// 6. Healthcheck para Docker / Monitoramento
app.get('/api/v1/health', async (_req, res) => {
  const dbHealthy = await checkDatabaseConnection();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'ok' : 'degraded',
    service: 'erp-loja-roupas-api',
    environment: env.NODE_ENV,
    appMode: env.APP_MODE,
    timestamp: new Date().toISOString(),
  });
});

// 7. Registro de Módulos de Rotas
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/products', productsRouter);
app.use('/api/v1/inventory', inventoryRouter);
app.use('/api/v1/orders', ordersRouter);
app.use('/api/v1/unity', unityRouter);

// 8. Rota 404 padronizada
app.use((_req, res) => {
  res.status(404).json({
    status: 'error',
    code: 'ROUTE_NOT_FOUND',
    message: 'Endpoint não encontrado.',
  });
});

// 9. Tratamento Centralizado de Erros
app.use(errorHandler);

