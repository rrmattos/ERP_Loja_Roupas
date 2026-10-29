import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

/**
 * Rate Limiter global para proteger a VPS de 1GB RAM contra flood de requisições
 */
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'TOO_MANY_REQUESTS',
    message: 'Muitas requisições deste endereço IP. Tente novamente em alguns minutos.',
  },
});

/**
 * Rate Limiter estrito para rotas de autenticação (prevenção de Brute-Force + log para Fail2ban)
 */
export const authRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const clientIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    logger.securityAuthFail(clientIp, 'RATE_LIMIT_EXCEEDED');
    res.status(429).json({
      status: 'error',
      code: 'AUTH_RATE_LIMIT',
      message: 'Muitas tentativas de autenticação. Aguarde 10 minutos.',
    });
  },
});

/**
 * Rate Limiter específico para criação de Lojas Sandbox no Portfólio (evita abuso de disco/banco)
 */
export const sandboxCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5, // Máx 5 lojas de teste criadas por hora pelo mesmo IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'SANDBOX_LIMIT_REACHED',
    message: 'Limite de criação de lojas de teste atingido para este IP. Use a Loja Demonstração ou tente mais tarde.',
  },
});

