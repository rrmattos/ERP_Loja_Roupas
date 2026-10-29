# =============================================================================
# Etapa 1: Build do Front-end React + TypeScript (Vite)
# =============================================================================
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# =============================================================================
# Etapa 2: Servidor Estático Ultra-Leve (Nginx Unprivileged - ~5MB RAM na VPS)
# =============================================================================
FROM nginxinc/nginx-unprivileged:alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

USER nginx
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]

