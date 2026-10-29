# =============================================================================
# Etapa 1: Build (Compilação TypeScript -> JavaScript)
# =============================================================================
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

# =============================================================================
# Etapa 2: Runtime (Execução enxuta e segura sem root)
# =============================================================================
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Cria diretório de uploads com permissão para o usuário não-root 'node'
RUN mkdir -p /app/uploads && chown -R node:node /app

COPY --chown=node:node --from=build /app/package*.json ./
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist

USER node
EXPOSE 4000

CMD ["node", "--max-old-space-size=140", "dist/server.js"]

