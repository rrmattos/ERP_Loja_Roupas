export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    console.log(
      JSON.stringify({ level: 'INFO', timestamp, message, ...(meta ?? {}) })
    );
  },

  warn(message: string, meta?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    console.warn(
      JSON.stringify({ level: 'WARN', timestamp, message, ...(meta ?? {}) })
    );
  },

  error(message: string, meta?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    console.error(
      JSON.stringify({ level: 'ERROR', timestamp, message, ...(meta ?? {}) })
    );
  },

  /**
   * Emite linha padronizada para detecção imediata pelo filtro do Fail2ban na VPS
   */
  securityAuthFail(ip: string, reason: string, email?: string): void {
    const timestamp = new Date().toISOString();
    console.warn(
      `${timestamp} [SECURITY_AUTH_FAIL] ip=${ip} reason=${reason} email=${email ?? 'unknown'}`
    );
  },
};

