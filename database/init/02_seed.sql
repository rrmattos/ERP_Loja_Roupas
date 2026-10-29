-- =============================================================================
-- ERP LOJA DE ROUPAS - FUNÇÃO DE SEED E DADOS INICIAIS (DEMO & SANDBOX)
-- =============================================================================

CREATE OR REPLACE FUNCTION seed_tenant_catalog(
    p_tenant_id UUID,
    p_include_demo_orders BOOLEAN DEFAULT FALSE
)
RETURNS VOID AS $$
DECLARE
    v_cat_camisetas UUID;
    v_cat_moletons UUID;
    v_cat_calcas UUID;
    v_sup_textil UUID;
    v_size_p UUID;
    v_size_m UUID;
    v_size_g UUID;
    v_size_gg UUID;
    v_color_black UUID;
    v_color_offwhite UUID;
    v_color_navy UUID;
    v_prod_oversized UUID;
    v_prod_hoodie UUID;
    v_var_over_p_blk UUID;
    v_var_over_m_blk UUID;
    v_var_over_g_wht UUID;
    v_var_hood_m_nvy UUID;
    v_var_hood_g_blk UUID;
    v_order_demo UUID;
BEGIN
    -- 1. Categorias Base
    INSERT INTO categories (tenant_id, name, slug, description)
    VALUES
        (p_tenant_id, 'Camisetas Streetwear', 'camisetas-streetwear', 'Camisetas de algodão egípcio e modelagem oversized'),
        (p_tenant_id, 'Moletons & Jaquetas', 'moletons-jaquetas', 'Hoodies pesados 3cabos e jaquetas corta-vento'),
        (p_tenant_id, 'Calças & Cargo', 'calcas-cargo', 'Calças jogger, jeans e cargo utilitárias')
    ON CONFLICT (tenant_id, slug) DO NOTHING;

    SELECT id INTO v_cat_camisetas FROM categories WHERE tenant_id = p_tenant_id AND slug = 'camisetas-streetwear';
    SELECT id INTO v_cat_moletons FROM categories WHERE tenant_id = p_tenant_id AND slug = 'moletons-jaquetas';
    SELECT id INTO v_cat_calcas FROM categories WHERE tenant_id = p_tenant_id AND slug = 'calcas-cargo';

    -- 2. Fornecedor Padrão
    INSERT INTO suppliers (tenant_id, name, document, email, phone, lead_time_days)
    VALUES (
        p_tenant_id,
        'Vértice Têxtil Confecções Ltda',
        '12.345.678/0001-90',
        'contato@verticetextil.com.br',
        '(11) 98765-4321',
        5
    )
    RETURNING id INTO v_sup_textil;

    -- 3. Grade de Tamanhos
    INSERT INTO sizes (tenant_id, code, name, display_order)
    VALUES
        (p_tenant_id, 'P', 'Pequeno', 1),
        (p_tenant_id, 'M', 'Médio', 2),
        (p_tenant_id, 'G', 'Grande', 3),
        (p_tenant_id, 'GG', 'Extra Grande', 4)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    SELECT id INTO v_size_p FROM sizes WHERE tenant_id = p_tenant_id AND code = 'P';
    SELECT id INTO v_size_m FROM sizes WHERE tenant_id = p_tenant_id AND code = 'M';
    SELECT id INTO v_size_g FROM sizes WHERE tenant_id = p_tenant_id AND code = 'G';
    SELECT id INTO v_size_gg FROM sizes WHERE tenant_id = p_tenant_id AND code = 'GG';

    -- 4. Cartela de Cores (com Hex Code para Shaders da Unity 3D)
    INSERT INTO colors (tenant_id, name, hex_code)
    VALUES
        (p_tenant_id, 'Preto Ônix', '#111827'),
        (p_tenant_id, 'Off-White', '#F3F4F6'),
        (p_tenant_id, 'Azul Marinho', '#1E3A8A')
    ON CONFLICT (tenant_id, name) DO NOTHING;

    SELECT id INTO v_color_black FROM colors WHERE tenant_id = p_tenant_id AND name = 'Preto Ônix';
    SELECT id INTO v_color_offwhite FROM colors WHERE tenant_id = p_tenant_id AND name = 'Off-White';
    SELECT id INTO v_color_navy FROM colors WHERE tenant_id = p_tenant_id AND name = 'Azul Marinho';

    -- 5. Produtos Pré-Cadastrados (2 Produtos Padrão para qualquer nova Loja / Demo)
    INSERT INTO products (
        tenant_id, category_id, supplier_id, name, slug, description,
        base_price, cost_price, image_url, is_custom_upload,
        unity_prefab_id, unity_category_slot, unity_metadata
    )
    VALUES (
        p_tenant_id,
        v_cat_camisetas,
        v_sup_textil,
        'Camiseta Oversized Heavy Cotton',
        'camiseta-oversized-heavy-cotton',
        'Camiseta streetwear em malha 260g 100% algodão penteado, gola canelada 3cm.',
        129.90,
        48.50,
        '/presets/tshirt-oversized.svg',
        FALSE,
        'PFB_TSHIRT_OVERSIZED_01',
        'TORSO',
        '{"meshLod": 2, "clothPhysics": true}'::jsonb
    )
    RETURNING id INTO v_prod_oversized;

    INSERT INTO products (
        tenant_id, category_id, supplier_id, name, slug, description,
        base_price, cost_price, image_url, is_custom_upload,
        unity_prefab_id, unity_category_slot, unity_metadata
    )
    VALUES (
        p_tenant_id,
        v_cat_moletons,
        v_sup_textil,
        'Moletom Canguru Cyber Tech',
        'moletom-canguru-cyber-tech',
        'Moletom felpado 350g com capuz duplo e acabamento hidro-repelente.',
        249.90,
        95.00,
        '/presets/hoodie-cyber.svg',
        FALSE,
        'PFB_HOODIE_CYBER_01',
        'TORSO',
        '{"meshLod": 2, "clothPhysics": true, "hasHood": true}'::jsonb
    )
    RETURNING id INTO v_prod_hoodie;

    -- 6. Matriz de Variações (SKUs reais por Tamanho + Cor)
    INSERT INTO product_variants (tenant_id, product_id, size_id, color_id, sku, barcode_ean, stock_quantity, min_stock_alert)
    VALUES
        (p_tenant_id, v_prod_oversized, v_size_p, v_color_black, 'TSH-OVR-BLK-P', '7890001000011', 15, 5)
    RETURNING id INTO v_var_over_p_blk;

    INSERT INTO product_variants (tenant_id, product_id, size_id, color_id, sku, barcode_ean, stock_quantity, min_stock_alert)
    VALUES
        (p_tenant_id, v_prod_oversized, v_size_m, v_color_black, 'TSH-OVR-BLK-M', '7890001000012', 24, 5)
    RETURNING id INTO v_var_over_m_blk;

    INSERT INTO product_variants (tenant_id, product_id, size_id, color_id, sku, barcode_ean, stock_quantity, min_stock_alert)
    VALUES
        (p_tenant_id, v_prod_oversized, v_size_g, v_color_offwhite, 'TSH-OVR-WHT-G', '7890001000013', 18, 5)
    RETURNING id INTO v_var_over_g_wht;

    INSERT INTO product_variants (tenant_id, product_id, size_id, color_id, sku, barcode_ean, stock_quantity, min_stock_alert)
    VALUES
        (p_tenant_id, v_prod_hoodie, v_size_m, v_color_navy, 'HOD-CYB-NVY-M', '7890002000011', 10, 4)
    RETURNING id INTO v_var_hood_m_nvy;

    INSERT INTO product_variants (tenant_id, product_id, size_id, color_id, sku, barcode_ean, stock_quantity, min_stock_alert)
    VALUES
        (p_tenant_id, v_prod_hoodie, v_size_g, v_color_black, 'HOD-CYB-BLK-G', '7890002000012', 4, 5)
    RETURNING id INTO v_var_hood_g_blk;

    -- 7. Registro Transacional de Saldo Inicial no Livro-Razão (stock_movements)
    INSERT INTO stock_movements (
        tenant_id, variant_id, supplier_id, movement_type,
        quantity, previous_stock, new_stock, unit_cost, reason
    )
    VALUES
        (p_tenant_id, v_var_over_p_blk, v_sup_textil, 'INITIAL_BALANCE', 15, 0, 15, 48.50, 'Carga inicial do catálogo'),
        (p_tenant_id, v_var_over_m_blk, v_sup_textil, 'INITIAL_BALANCE', 24, 0, 24, 48.50, 'Carga inicial do catálogo'),
        (p_tenant_id, v_var_over_g_wht, v_sup_textil, 'INITIAL_BALANCE', 18, 0, 18, 48.50, 'Carga inicial do catálogo'),
        (p_tenant_id, v_var_hood_m_nvy, v_sup_textil, 'INITIAL_BALANCE', 10, 0, 10, 95.00, 'Carga inicial do catálogo'),
        (p_tenant_id, v_var_hood_g_blk, v_sup_textil, 'INITIAL_BALANCE', 4,  0, 4,  95.00, 'Carga inicial do catálogo');

    -- 8. Se for a Loja Demo Pública, registra um pedido de exemplo vindo do Meta Quest (Unity)
    IF p_include_demo_orders THEN
        INSERT INTO orders (
            tenant_id, channel, status, customer_name, customer_email,
            unity_session_id, idempotency_key, total_amount, notes
        )
        VALUES (
            p_tenant_id, 'UNITY_META_QUEST', 'PAID',
            'Visitante VR (Meta Quest 3)', 'vr.player@example.com',
            'QUEST3-SESSION-DEMO-001', 'DEMO-IDEMPOTENCY-001',
            379.80, 'Compra realizada na loja virtual 3D (Unity)'
        )
        RETURNING id INTO v_order_demo;

        INSERT INTO order_items (tenant_id, order_id, variant_id, quantity, unit_price, subtotal)
        VALUES
            (p_tenant_id, v_order_demo, v_var_over_m_blk, 1, 129.90, 129.90),
            (p_tenant_id, v_order_demo, v_var_hood_m_nvy, 1, 249.90, 249.90);
    END IF;
END;
$$ LANGUAGE plpgsql;

