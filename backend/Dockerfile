# =============================================================================
# Etapa 1: Build (Compilação TypeScript -> JavaScript)
# =============================================================================
FROM node:24-alpine AS build
WORKDIR /app

COPY backend/package*.json ./
RUN npm ci

COPY backend/tsconfig.json ./
COPY backend/src ./src
COPY database/init/02_seed.sql ./database/init/02_seed.sql
RUN npm run build
RUN npm prune --omit=dev

# =============================================================================
# Etapa 2: Runtime (Execução enxuta e segura sem root)
# =============================================================================
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Cria diretório de uploads com permissão para o usuário não-root 'node'
RUN mkdir -p /app/uploads && chown -R node:node /app

COPY --chown=node:node --from=build /app/package*.json ./
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/database ./database

USER node
EXPOSE 4000

CMD ["node", "--max-old-space-size=140", "dist/server.js"]

