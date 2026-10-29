# Vértice Fashion ERP (SaaS Multi-Tenant)

Sistema **ERP de Loja de Roupas** com arquitetura **Multi-Tenant (`tenant_id`)**, controle de grade de variações (**Tamanhos × Cores × SKU**), livro-razão de estoque transacional (**ACID / `SELECT ... FOR UPDATE`**) e API RESTful preparada para integração futura com e-commerce gamificado em ambiente 3d **(Unity 3D)**.

---

## 🏗️ Arquitetura e Diferenciais Técnicos

- **Arquitetura 3-Tier Containerizada (`erp_db` + `erp_api` + `erp_web`):**
  - **Banco de Dados (`erp_db`):** PostgreSQL 16 Alpine em rede Docker interna isolada (`internal: true`, sem expor a porta `5432` para a internet) e ajustado para baixo consumo de RAM (~35 MB).
  - **Back-end (`erp_api`):** Node.js 20 Alpine + TypeScript + Express + Zod, rodando com usuário não-root (`USER node`).
  - **Front-end (`erp_web`):** React 18 + TypeScript + Vite + Tailwind CSS, servido via `nginxinc/nginx-unprivileged:alpine` (~5 MB de RAM).
- **Multi-Tenancy & Modo Showcase de Portfólio (`APP_MODE`):**
  - **`APP_MODE=portfolio_sandbox` (Homologação / Vitrine do Portfólio):**
    1. **Acesso 1-Clique na Loja Demonstração:** Visitantes e recrutadores entram sem precisar preencher formulários.
    2. **Criação de Loja Teste Isolada (Sandbox):** O visitante cria sua própria loja (`tenant`) que já nasce com **2 produtos pré-cadastrados**, grade de tamanhos/cores e saldo inicial via *stored function* SQL (`seed_tenant_catalog`).
    3. **Faxina Automática a cada 24h:** Agendador interno remove lojas sandbox vencidas, exclui imagens enviadas do disco (`/uploads`) e restaura a Loja Demonstração para o padrão de fábrica.
  - **`APP_MODE=commercial_production` (Produção Comercial):** Desativa automaticamente os acessos públicos de demonstração/sandbox e o reset de 24h, operando como um ERP corporativo fechado.
- **Segurança em Profundidade (OWASP):**
  - Validação estrita de payloads e variáveis de ambiente com **Zod**.
  - Senhas com hash **bcrypt (cost 12)** + bloqueio temporário de conta após 5 tentativas inválidas (*Account Lockout*).
  - **JWT Access Token (15m)** + **Refresh Token (7d)** com rotação automática em cookie `HttpOnly`, `Secure`, `SameSite=Strict` e hash SHA-256 no banco.
  - Upload de imagens com **compressão cliente para WebP** (reduzindo fotos de 5 MB para ~45 KB) e **validação binária de Magic Bytes** no servidor.
  - Logs padronizados (`[SECURITY_AUTH_FAIL]`) prontos para o **Fail2ban** da VPS.

---

## 💻 Como Rodar Localmente (Ambiente de Desenvolvimento no Windows)

### 1. Subir o Banco PostgreSQL de Desenvolvimento
Na raiz do projeto:
```bash
docker compose -f docker-compose.dev.yml up -d
```
*(Os scripts `database/init/01_schema.sql` e `02_seed.sql` serão executados automaticamente).*

### 2. Iniciar o Back-end (Node.js + TypeScript)
```bash
cd backend
cp ../.env.example .env
npm install
npm run dev
```
O servidor iniciará em `http://localhost:4000`.

### 3. Iniciar o Front-end (React + Vite)
Em outro terminal:
```bash
cd frontend
npm install
npm run dev
```
Acesse no navegador: **`http://localhost:5173`**.

---

## 🚀 Como Fazer o Deploy na VPS (Ubuntu 24.04 + Docker + Caddy)

1. Na VPS, clone o repositório e crie o arquivo `.env` na raiz baseado no `.env.example` (definindo senhas fortes para `DB_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` e `ADMIN_PASSWORD`).
2. Suba os containers:
   ```bash
   docker compose up -d --build
   ```
3. Adicione o bloco do arquivo [`infra/caddy/Caddyfile.snippet`](./infra/caddy/Caddyfile.snippet) ao `Caddyfile` do seu container `caddy_proxy` e recarregue o Caddy:
   ```bash
   docker exec caddy_proxy caddy reload --config /etc/caddy/Caddyfile
   ```

---

## 🎮 Endpoints Preparados para o Motor Gráfico Unity 3D

As rotas abaixo utilizam os headers `X-Tenant-Slug` e `X-Unity-Api-Key` (exibidos no Dashboard do ERP):

- **`GET /api/v1/unity/catalog`**: Retorna produtos ativos com `unityPrefabId`, `unityCategorySlot`, cores com `colorHex` (`#RRGGBB`) para os *Shaders* da Unity e estoque em tempo real por SKU.
- **`POST /api/v1/unity/checkout`**: Recebe o carrinho VR com `idempotencyKey` e `unitySessionId`, executa `SELECT ... FOR UPDATE` nos SKUs, cria o pedido com canal `UNITY_META_QUEST`, dá baixa no estoque e registra a saída no livro-razão (`stock_movements`).

