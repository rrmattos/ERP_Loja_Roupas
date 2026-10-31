-- =============================================================================
-- ERP LOJA DE ROUPAS (SaaS Multi-Tenant + Integração Unity 3D / Meta Quest)
-- Script DDL Inicial - PostgreSQL 16+
-- =============================================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. ENUMS (Tipos Estritos de Domínio)
-- =============================================================================
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('OWNER', 'ADMIN', 'STAFF', 'DEMO_VIEWER');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE stock_movement_type AS ENUM (
        'INITIAL_BALANCE',   -- Saldo inicial no cadastro
        'PURCHASE_IN',       -- Entrada por compra de fornecedor
        'SALE_OUT',          -- Saída por venda (PDV Web ou Unity VR)
        'RETURN_IN',         -- Devolução de cliente
        'ADJUSTMENT_IN',     -- Ajuste manual positivo (inventário)
        'ADJUSTMENT_OUT'     -- Ajuste manual negativo (perda/avaria)
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE sales_channel AS ENUM (
        'ERP_POS',           -- Venda registrada no painel do ERP
        'WEB_ECOMMERCE',     -- E-commerce tradicional
        'UNITY_META_QUEST'   -- E-commerce Gamificado VR (Unity 3D)
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE order_status AS ENUM (
        'PENDING',
        'PAID',
        'SHIPPED',
        'COMPLETED',
        'CANCELLED'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 2. TABELA DE TENANTS (Lojas - Isolamento Multi-Tenant + Controle de Sandbox)
-- =============================================================================
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) NOT NULL,
    legal_name VARCHAR(160) NULL,
    document VARCHAR(30) NULL,
    state_registration VARCHAR(40) NULL,
    email VARCHAR(160) NULL,
    phone VARCHAR(30) NULL,
    address VARCHAR(255) NULL,
    logo_url TEXT NULL,
    slug VARCHAR(80) NOT NULL UNIQUE,
    -- Controle de Portfólio / Homologação:
    -- is_demo: Loja pública compartilhada (acesso 1-clique, reseta a cada 24h)
    -- is_sandbox: Loja criada por recrutador/visitante (expira após 24h)
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
    max_products INTEGER NOT NULL DEFAULT 15,
    unity_api_key VARCHAR(128) UNIQUE,
    expires_at TIMESTAMPTZ NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_sandbox_Cleanup
    ON tenants (is_sandbox, expires_at)
    WHERE is_sandbox = TRUE;

-- =============================================================================
-- 3. TABELA DE USUÁRIOS E TOKENS (Autenticação JWT + Brute-Force Protection)
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(160) NOT NULL,
    phone VARCHAR(30) NULL,
    document VARCHAR(30) NULL,
    address VARCHAR(255) NULL,
    job_title VARCHAR(80) NULL DEFAULT 'Vendedor(a)',
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'ADMIN',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    failed_login_attempts SMALLINT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ NULL,
    last_login_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_users_tenant_email UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users (tenant_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    user_agent VARCHAR(255) NULL,
    ip_address VARCHAR(64) NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);

-- =============================================================================
-- 4. CATEGORIAS E FORNECEDORES
-- =============================================================================
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL,
    slug VARCHAR(90) NOT NULL,
    description VARCHAR(255) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_categories_tenant_slug UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories (tenant_id);

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    document VARCHAR(30) NULL, -- CNPJ / CPF
    email VARCHAR(160) NULL,
    phone VARCHAR(30) NULL,
    address VARCHAR(255) NULL,
    lead_time_days SMALLINT NOT NULL DEFAULT 7,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers (tenant_id);

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(160) NULL,
    phone VARCHAR(30) NULL,
    document VARCHAR(30) NULL, -- CPF / CNPJ opcional
    notes VARCHAR(255) NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers (tenant_id);

-- =============================================================================
-- 5. MATRIZ DE ATRIBUTOS DO VESTUÁRIO (TAMANHOS E CORES)
-- =============================================================================
CREATE TABLE IF NOT EXISTS sizes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(10) NOT NULL,          -- Ex: PP, P, M, G, GG, 38, 40, 42
    name VARCHAR(50) NOT NULL,          -- Ex: Pequeno, Médio, Grande
    display_order SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sizes_tenant_code UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_sizes_tenant ON sizes (tenant_id, display_order);

CREATE TABLE IF NOT EXISTS colors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,          -- Ex: Preto Ônix, Off-White, Azul Marinho
    hex_code CHAR(7) NOT NULL,          -- Ex: #111827 (Usado no UI e no Shader/Material da Unity 3D)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_colors_hex_format CHECK (hex_code ~ '^#[0-9A-Fa-f]{6}$'),
    CONSTRAINT uq_colors_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_colors_tenant ON colors (tenant_id);

-- =============================================================================
-- 6. CATÁLOGO DE PRODUTOS (PRODUTO MODELO) E VARIAÇÕES (GRADE / SKUs)
-- =============================================================================
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UUID NULL REFERENCES categories(id) ON DELETE SET NULL,
    supplier_id UUID NULL REFERENCES suppliers(id) ON DELETE SET NULL,
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(170) NOT NULL,
    description TEXT NULL,
    base_price NUMERIC(10, 2) NOT NULL CHECK (base_price >= 0),
    cost_price NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
    image_url VARCHAR(500) NULL,
    is_custom_upload BOOLEAN NOT NULL DEFAULT FALSE,
    -- Campos preparados para integração com motor gráfico Unity 3D (Meta Quest)
    unity_prefab_id VARCHAR(100) NULL,  -- ID do Prefab 3D no AssetBundle/Addressables da Unity
    unity_category_slot VARCHAR(50) NULL, -- Ex: 'TORSO', 'LEGS', 'FEET', 'ACCESSORY'
    unity_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_products_tenant_slug UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_products_tenant_active ON products (tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (tenant_id, category_id);

-- Matriz de Variações: Onde residem o SKU real e o saldo de estoque por Tamanho + Cor
CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    size_id UUID NOT NULL REFERENCES sizes(id) ON DELETE RESTRICT,
    color_id UUID NOT NULL REFERENCES colors(id) ON DELETE RESTRICT,
    sku VARCHAR(64) NOT NULL,
    barcode_ean VARCHAR(32) NULL,
    -- Permite preço específico na variação (ex: GG mais caro); se NULL, usa products.base_price
    price_override NUMERIC(10, 2) NULL CHECK (price_override IS NULL OR price_override >= 0),
    -- Saldo consolidado com trava de integridade contra estoque negativo
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    min_stock_alert INTEGER NOT NULL DEFAULT 5 CHECK (min_stock_alert >= 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_variants_tenant_sku UNIQUE (tenant_id, sku),
    CONSTRAINT uq_variants_product_size_color UNIQUE (product_id, size_id, color_id)
);

CREATE INDEX IF NOT EXISTS idx_variants_tenant_product ON product_variants (tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_variants_tenant_sku ON product_variants (tenant_id, sku);

-- =============================================================================
-- 7. PEDIDOS / VENDAS (ERP PDV & CHECKOUT UNITY 3D / META QUEST)
-- =============================================================================
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_number BIGSERIAL,
    channel sales_channel NOT NULL DEFAULT 'ERP_POS',
    status order_status NOT NULL DEFAULT 'PAID',
    customer_id UUID NULL REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(120) NULL,
    customer_email VARCHAR(160) NULL,
    customer_document VARCHAR(30) NULL,
    invoice_number VARCHAR(30) NULL,
    invoice_series VARCHAR(10) NULL DEFAULT '001',
    invoice_access_key VARCHAR(60) NULL,
    invoice_issued_at TIMESTAMPTZ NULL,
    -- Metadados da sessão VR quando a compra vier do Meta Quest
    unity_session_id VARCHAR(120) NULL,
    -- Chave de idempotência para evitar cobrança/baixa duplicada se a rede oscilar
    idempotency_key VARCHAR(120) NULL,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    notes TEXT NULL,
    created_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_orders_tenant_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_created ON orders (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_channel ON orders (tenant_id, channel);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant ON order_items (tenant_id, variant_id);

-- =============================================================================
-- 8. CONTROLE DE ESTOQUE TRANSACIONAL (LEDGER / LIVRO-RAZÃO IMUTÁVEL)
-- =============================================================================
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    supplier_id UUID NULL REFERENCES suppliers(id) ON DELETE SET NULL,
    order_id UUID NULL REFERENCES orders(id) ON DELETE SET NULL,
    movement_type stock_movement_type NOT NULL,
    -- Quantidade sempre positiva; a direção é dada pelo movement_type
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    previous_stock INTEGER NOT NULL CHECK (previous_stock >= 0),
    new_stock INTEGER NOT NULL CHECK (new_stock >= 0),
    unit_cost NUMERIC(10, 2) NULL CHECK (unit_cost IS NULL OR unit_cost >= 0),
    invoice_number VARCHAR(40) NULL,
    tag_code VARCHAR(60) NULL,
    reason VARCHAR(255) NULL,
    reference_channel sales_channel NULL,
    created_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_date
    ON stock_movements (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_variant
    ON stock_movements (tenant_id, variant_id, created_at DESC);

-- =============================================================================
-- 9. TRIGGER AUTOMÁTICA DE UPDATED_AT
-- =============================================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_tenants ON tenants;
CREATE TRIGGER set_updated_at_tenants
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_users ON users;
CREATE TRIGGER set_updated_at_users
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_suppliers ON suppliers;
CREATE TRIGGER set_updated_at_suppliers
    BEFORE UPDATE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_products ON products;
CREATE TRIGGER set_updated_at_products
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_product_variants ON product_variants;
CREATE TRIGGER set_updated_at_product_variants
    BEFORE UPDATE ON product_variants
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_orders ON orders;
CREATE TRIGGER set_updated_at_orders
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

