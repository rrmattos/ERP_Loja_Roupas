# Sistema de Gestão ERP (SaaS Multi-Tenant)

Sistema **ERP de Loja de Roupas** com arquitetura **Multi-Tenant (`tenant_id`)**, controle de grade de variações (**Tamanhos × Cores × SKU**), livro-razão de estoque transacional (**ACID / `SELECT ... FOR UPDATE`**) e API RESTful preparada para integração futura com e-commerce gamificado em ambiente 3d **(Unity 3D)**.

---

## 🏗️ Arquitetura e Diferenciais Técnicos

- **Arquitetura 3-Tier Containerizada (`erp_db` + `erp_api` + `erp_web`):**
  - **Banco de Dados (`erp_db`):** PostgreSQL 16 Alpine em rede Docker interna isolada (`internal: true`, sem expor a porta `5432` para a internet) com limite de 160 MiB; o consumo real depende da carga.
  - **Back-end (`erp_api`):** Node.js 24 Alpine + TypeScript + Express + Zod, rodando com usuário não-root (`USER node`).
  - **Front-end (`erp_web`):** React 18 + TypeScript + Vite + Tailwind CSS, servido via `nginxinc/nginx-unprivileged:alpine`, com limite de 48 MiB.
- **Multi-Tenancy & Modo Showcase de Portfólio (`APP_MODE`):**
  - **`APP_MODE=portfolio_sandbox` (Homologação / Vitrine do Portfólio):**
    1. **Acesso 1-Clique na Loja Demonstração:** Visitantes e recrutadores entram sem precisar preencher formulários.
    2. **Criação de Loja Teste Isolada (Sandbox):** O visitante cria sua própria loja (`tenant`) que já nasce com **2 produtos pré-cadastrados**, grade de tamanhos/cores e saldo inicial via *stored function* SQL (`seed_tenant_catalog`).
    3. **Expiração das sandboxes:** por padrão, 24 horas após a criação (`SANDBOX_TTL_HOURS=24`). A limpeza verifica lojas vencidas a cada hora e na inicialização da API, excluindo registros vinculados e uploads sem outras referências. A loja oficial não expira.
    4. **Reset da demonstração pública:** executado a cada `SANDBOX_TTL_HOURS` horas de execução contínua da API (24 por padrão). Restaura catálogo, estoque, vendas e cadastros comerciais de exemplo e remove a logo customizada. Não recria os usuários nem restaura todos os campos do perfil da loja. O intervalo reinicia quando a API é reiniciada; não é um cron diário à meia-noite.
    5. **Sessões:** os sete dias correspondem à validade do refresh token, não à duração dos dados de uma loja. Alterar o TTL não recalcula a expiração de sandboxes já criadas.
  - **`APP_MODE=commercial_production` (Produção Comercial):** Desativa automaticamente os acessos públicos de demonstração/sandbox e o reset de 24h, operando como um ERP corporativo fechado. A limpeza periódica de tokens vencidos/revogados continua ativa.
- **Segurança em Profundidade (OWASP):**
  - Validação estrita de payloads e variáveis de ambiente com **Zod**.
  - Senhas com hash **bcrypt (cost 12)** + bloqueio temporário de conta após 5 tentativas inválidas (*Account Lockout*).
  - **JWT Access Token (15m)** + **Refresh Token (7d)** com rotação automática em cookie `HttpOnly`, `Secure`, `SameSite=Strict` e hash SHA-256 no banco.
  - Upload de imagens de até **2 MiB**, com **compressão cliente para WebP**, validação de MIME/assinatura e exclusão segura após persistência. O tamanho final depende da imagem.
  - Logs padronizados (`[SECURITY_AUTH_FAIL]`) para integração opcional com **Fail2ban**. Instalar o serviço não ativa a jail do ERP: é necessário configurar origem dos logs e ação compatível com a rede Docker.

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

O deploy usa um projeto Compose separado (`-p erp`), preservando os serviços existentes.
Não é necessário instalar Node.js diretamente na VPS.

1. **Na máquina local**, construa imagens Linux/amd64 e transfira o arquivo para a VPS (exemplo de tag; use a versão desejada):
   ```bash
   TAG=76f4aa9
   docker build --platform linux/amd64 -t erp-api:$TAG -f backend/Dockerfile .
   docker build --platform linux/amd64 -t erp-web:$TAG -f frontend/Dockerfile frontend
   docker save -o erp-images.tar erp-api:$TAG erp-web:$TAG
   scp erp-images.tar USUARIO@IP_DA_VPS:/CAMINHO/DO/ERP/
   ```
   Esses comandos usam Bash/Git Bash. Salve o arquivo fora da pasta do projeto se o Windows bloquear a gravação. Não versione o `.tar`.
2. **Na VPS**, clone/atualize o repositório. Configure o `.env` na raiz, com permissão `600`, segredos exclusivos, `NODE_ENV=production`, `APP_MODE=portfolio_sandbox`, `CORS_ORIGIN=https://erp.rafaelrmattos.com` e `CADDY_DOCKER_NETWORK=portfolioweb_app-net` (confirme o nome real da rede do Caddy). Não publique o `.env` nem a saída de `docker compose config` sem `--quiet`.
3. Carregue as imagens e crie `docker-compose.images.yml`, usando a mesma tag construída:
   ```bash
   docker load -i erp-images.tar
   ```
   ```yaml
   services:
     erp_api:
       image: erp-api:76f4aa9
     erp_web:
       image: erp-web:76f4aa9
   ```
   ```bash
   docker compose -p erp -f docker-compose.yml -f docker-compose.images.yml config --quiet
   docker compose -p erp -f docker-compose.yml -f docker-compose.images.yml up -d --no-build
   ```
4. Aponte o registro DNS `A` de `erp` para o IPv4 da VPS. Faça backup do Caddyfile existente e acrescente **somente o bloco do ERP** de [`infra/caddy/Caddyfile.snippet`](./infra/caddy/Caddyfile.snippet), preservando o site Blazor. Valide antes de recarregar:
   ```bash
   docker exec caddy_proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   docker exec caddy_proxy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
   curl -fsS https://erp.rafaelrmattos.com/api/v1/health
   ```
5. Verifique demo, criação de sandbox, uploads e exportações no navegador. Monitore `docker stats --no-stream`, RAM, swap e disco junto dos serviços Blazor/MySQL. O Fail2ban existente pode continuar protegendo SSH; a proteção específica do ERP é configurada separadamente.

Os dados e uploads ficam em volumes persistentes. Mantenha backups e o mesmo nome de projeto (`-p erp`) nas atualizações. Não use `docker compose down -v` em produção: essa opção remove os volumes.

---

## 🎮 Endpoints Preparados para o Motor Gráfico Unity 3D

As rotas abaixo utilizam os headers `X-Tenant-Slug` e `X-Unity-Api-Key` (exibidos no Dashboard do ERP):

- **`GET /api/v1/unity/catalog`**: Retorna produtos ativos com `unityPrefabId`, `unityCategorySlot`, cores com `colorHex` (`#RRGGBB`) para os *Shaders* da Unity e estoque em tempo real por SKU.
- **`POST /api/v1/unity/checkout`**: Recebe o carrinho VR com `idempotencyKey` e `unitySessionId`, executa `SELECT ... FOR UPDATE` nos SKUs, cria o pedido com canal `UNITY_META_QUEST`, dá baixa no estoque e registra a saída no livro-razão (`stock_movements`).

# Validação da Fase 1

O acesso rápido da demonstração continua sem senha. Novas lojas sandbox recebem
um proprietário com a senha escolhida pelo visitante e dois funcionários fictícios
com credenciais aleatórias independentes. O seed não popula lojas comerciais.
No primeiro startup desta versão, o bootstrap atualiza a função SQL também nos
bancos existentes e troca somente as credenciais legadas identificadas pelo hash
antigo e pelo e-mail padrão dos funcionários fictícios; não exclui contas.

Uploads têm limite binário de 2 MiB; Express e Caddy aceitam corpos de 3 MiB para
comportar Base64 e metadados. Substituições apagam o arquivo anterior após commit,
com verificação de propriedade e de referências compartilhadas. Falhas de remoção
ficam registradas nos logs. TensorFlow permanece no navegador, carregado no submit;
a moderação no cliente não oferece garantia contra chamadas diretas à API.

O build Docker da API agora usa a **raiz do repositório** como contexto para incluir
`database/init/02_seed.sql`. O Compose já está ajustado. Para builds individuais:

```sh
docker build -f backend/Dockerfile -t erp-api .
docker build -f frontend/Dockerfile -t erp-web frontend
```

O pool tem cinco conexões, timeout de consulta de 10 segundos e timeout de transação
ociosa de 15 segundos. Compile as imagens antes do deploy, em uma máquina com mais
memória; o limite de RAM dos containers em execução não limita o consumo do build.
Em staging/produção, defina `CORS_ORIGIN` explicitamente. A VPS do portfólio deve usar
`APP_MODE=portfolio_sandbox`; substitua os segredos de exemplo antes de publicar.

Testes reproduzíveis, executados a partir da raiz, após instalar as dependências:

```sh
docker run -d --name erp-phase1-audit-pg --memory 256m -p 127.0.0.1:55439:5432 -e POSTGRES_PASSWORD=phase1_test_only -e POSTGRES_DB=erp_phase1 --tmpfs /var/lib/postgresql/data:rw postgres:16-alpine
npm --prefix backend run test:integration
npm --prefix frontend test
npm --prefix frontend run build
docker rm -f erp-phase1-audit-pg
```

Espere o PostgreSQL ficar pronto antes de executar os testes. O teste de integração
usa exclusivamente o banco temporário `erp_phase1` na porta 55439, recria os dados
desse banco e usa um diretório temporário para uploads; não lê o `.env` do projeto.
Os testes de imagem usam previsões simuladas para conferir os limiares e o ciclo
de vida do modelo. A qualidade visual precisa ser reavaliada com as fotos reais.

Pendência encontrada no build limpo: `npm audit` aponta severidade alta para
`xlsx@0.18.5`, sem correção automática no registro npm. O fluxo atual exporta
planilhas; não importa arquivos externos. A atualização/substituição da biblioteca
fica registrada para uma mudança própria, com validação das exportações.

