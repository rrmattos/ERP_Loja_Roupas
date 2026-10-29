import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../config/database';
import { AppError } from '../../shared/errors/AppError';
import { requireAuth } from '../../shared/middlewares/auth.middleware';
import {
  PRESET_GALLERY_IMAGES,
  processProductImage,
  removeCustomUploadIfExists,
} from '../../shared/utils/imageUpload';

export const productsRouter = Router();

productsRouter.use(requireAuth);

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

const createCategorySchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(255).optional(),
});

const createSupplierSchema = z.object({
  name: z.string().min(2).max(120),
  document: z.string().max(30).optional(),
  email: z.string().email().max(160).optional().or(z.literal('')),
  phone: z.string().max(30).optional(),
  leadTimeDays: z.coerce.number().int().min(1).max(180).default(7),
});

const createSizeSchema = z.object({
  code: z.string().min(1).max(10).transform((v) => v.toUpperCase().trim()),
  name: z.string().min(2).max(50),
  displayOrder: z.coerce.number().int().min(0).max(100).default(10),
});

const createColorSchema = z.object({
  name: z.string().min(2).max(50),
  hexCode: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Informe um código Hex válido (ex: #111827)'),
});

const variantInputSchema = z.object({
  sizeId: z.string().uuid(),
  colorId: z.string().uuid(),
  sku: z.string().min(2).max(64).transform((v) => v.toUpperCase().trim()),
  barcodeEan: z.string().max(32).optional().nullable(),
  priceOverride: z.coerce.number().min(0).optional().nullable(),
  initialStock: z.coerce.number().int().min(0).max(10000).default(0),
  minStockAlert: z.coerce.number().int().min(0).max(1000).default(5),
});

const createProductSchema = z.object({
  name: z.string().min(2, 'Informe o nome do produto').max(150),
  categoryId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  basePrice: z.coerce.number().min(0.01, 'O preço base deve ser maior que zero'),
  costPrice: z.coerce.number().min(0).default(0),
  imageInput: z.string().optional().nullable(),
  unityPrefabId: z.string().max(100).optional().nullable(),
  unityCategorySlot: z
    .enum(['TORSO', 'LEGS', 'FEET', 'HEAD', 'ACCESSORY'])
    .optional()
    .nullable(),
  variants: z
    .array(variantInputSchema)
    .min(1, 'Cadastre ao menos 1 variação (Tamanho + Cor + SKU) para o produto')
    .max(40),
});

const updateProductSchema = z.object({
  name: z.string().min(2).max(150),
  categoryId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  basePrice: z.coerce.number().min(0.01),
  costPrice: z.coerce.number().min(0).default(0),
  imageInput: z.string().optional().nullable(),
  unityPrefabId: z.string().max(100).optional().nullable(),
  unityCategorySlot: z
    .enum(['TORSO', 'LEGS', 'FEET', 'HEAD', 'ACCESSORY'])
    .optional()
    .nullable(),
  active: z.boolean().default(true),
  newVariants: z.array(variantInputSchema).optional().default([]),
});

/**
 * GET /api/v1/products/metadata
 * Retorna categorias, fornecedores, tamanhos, cores, galeria de fotos prontas e limite do Tenant
 */
productsRouter.get('/metadata', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;

    const [categories, suppliers, sizes, colors, quotaRes] = await Promise.all([
      query(
        `SELECT id, name, slug, description FROM categories WHERE tenant_id = $1 ORDER BY name ASC`,
        [tenantId]
      ),
      query(
        `SELECT id, name, document, email, phone, lead_time_days AS "leadTimeDays"
         FROM suppliers WHERE tenant_id = $1 AND active = TRUE ORDER BY name ASC`,
        [tenantId]
      ),
      query(
        `SELECT id, code, name, display_order AS "displayOrder"
         FROM sizes WHERE tenant_id = $1 ORDER BY display_order ASC, code ASC`,
        [tenantId]
      ),
      query(
        `SELECT id, name, hex_code AS "hexCode"
         FROM colors WHERE tenant_id = $1 ORDER BY name ASC`,
        [tenantId]
      ),
      query<{ current_count: string; max_products: number }>(
        `SELECT
           (SELECT COUNT(*) FROM products WHERE tenant_id = $1) AS current_count,
           t.max_products
         FROM tenants t WHERE t.id = $1`,
        [tenantId]
      ),
    ]);

    const quotaRow = quotaRes.rows[0];

    res.json({
      categories: categories.rows,
      suppliers: suppliers.rows,
      sizes: sizes.rows,
      colors: colors.rows,
      presetGallery: PRESET_GALLERY_IMAGES,
      quota: {
        currentProducts: Number(quotaRow?.current_count ?? 0),
        maxProducts: quotaRow?.max_products ?? 15,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/products/attributes/categories
 */
productsRouter.post('/attributes/categories', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;
    const body = createCategorySchema.parse(req.body);
    const slug = slugify(body.name);

    const result = await query(
      `INSERT INTO categories (tenant_id, name, slug, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, slug, description`,
      [tenantId, body.name.trim(), slug, body.description ?? null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/products/attributes/suppliers
 */
productsRouter.post('/attributes/suppliers', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;
    const body = createSupplierSchema.parse(req.body);

    const result = await query(
      `INSERT INTO suppliers (tenant_id, name, document, email, phone, lead_time_days)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, document, email, phone, lead_time_days AS "leadTimeDays"`,
      [
        tenantId,
        body.name.trim(),
        body.document ?? null,
        body.email || null,
        body.phone ?? null,
        body.leadTimeDays,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/products/attributes/sizes
 */
productsRouter.post('/attributes/sizes', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;
    const body = createSizeSchema.parse(req.body);

    const result = await query(
      `INSERT INTO sizes (tenant_id, code, name, display_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id, code, name, display_order AS "displayOrder"`,
      [tenantId, body.code, body.name.trim(), body.displayOrder]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/products/attributes/colors
 */
productsRouter.post('/attributes/colors', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;
    const body = createColorSchema.parse(req.body);

    const result = await query(
      `INSERT INTO colors (tenant_id, name, hex_code)
       VALUES ($1, $2, $3)
       RETURNING id, name, hex_code AS "hexCode"`,
      [tenantId, body.name.trim(), body.hexCode.toUpperCase()]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/products
 * Lista todos os produtos da loja com sua Matriz de Variações (SKUs, Tamanhos, Cores e Saldo)
 */
productsRouter.get('/', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;

    const result = await query(
      `SELECT
         p.id,
         p.name,
         p.slug,
         p.description,
         p.category_id AS "categoryId",
         c.name AS "categoryName",
         p.supplier_id AS "supplierId",
         sup.name AS "supplierName",
         p.base_price::float8 AS "basePrice",
         p.cost_price::float8 AS "costPrice",
         p.image_url AS "imageUrl",
         p.is_custom_upload AS "isCustomUpload",
         p.unity_prefab_id AS "unityPrefabId",
         p.unity_category_slot AS "unityCategorySlot",
         p.active,
         p.created_at AS "createdAt",
         COALESCE(SUM(pv.stock_quantity), 0)::int AS "totalStock",
         COALESCE(
           json_agg(
             json_build_object(
               'id', pv.id,
               'sku', pv.sku,
               'barcodeEan', pv.barcode_ean,
               'sizeId', s.id,
               'sizeCode', s.code,
               'sizeName', s.name,
               'colorId', col.id,
               'colorName', col.name,
               'colorHex', col.hex_code,
               'priceOverride', pv.price_override::float8,
               'finalPrice', COALESCE(pv.price_override, p.base_price)::float8,
               'stockQuantity', pv.stock_quantity,
               'minStockAlert', pv.min_stock_alert,
               'isLowStock', (pv.stock_quantity <= pv.min_stock_alert),
               'active', pv.active
             ) ORDER BY s.display_order ASC, col.name ASC
           ) FILTER (WHERE pv.id IS NOT NULL),
           '[]'::json
         ) AS variants
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers sup ON sup.id = p.supplier_id
       LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.tenant_id = p.tenant_id
       LEFT JOIN sizes s ON s.id = pv.size_id
       LEFT JOIN colors col ON col.id = pv.color_id
       WHERE p.tenant_id = $1
       GROUP BY p.id, c.name, sup.name
       ORDER BY p.created_at DESC`,
      [tenantId]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/products
 * Cria um Produto + Matriz de Variações (SKUs) + Saldo Inicial no Livro-Razão
 * Respeita a cota máxima de produtos da loja (ex: 15 produtos no Sandbox)
 */
productsRouter.post('/', async (req, res, next) => {
  let uploadedImageUrl: string | null = null;
  let isCustom = false;

  try {
    const { tenantId, userId } = req.auth!;
    const body = createProductSchema.parse(req.body);

    // 1. Verifica limite de produtos do Tenant (Proteção de Disco/Banco na VPS)
    const quotaCheck = await query<{ current_count: string; max_products: number }>(
      `SELECT
         (SELECT COUNT(*) FROM products WHERE tenant_id = $1) AS current_count,
         t.max_products
       FROM tenants t WHERE t.id = $1`,
      [tenantId]
    );

    const currentCount = Number(quotaCheck.rows[0]?.current_count ?? 0);
    const maxProducts = quotaCheck.rows[0]?.max_products ?? 15;

    if (currentCount >= maxProducts) {
      throw new AppError(
        `Limite de ${maxProducts} produtos atingido para esta loja de demonstração/teste. Exclua um produto existente para cadastrar outro.`,
        403,
        'PRODUCT_QUOTA_EXCEEDED'
      );
    }

    // 2. Processa imagem (Preset ou Upload Base64 WebP/PNG/JPG validado por Magic Bytes)
    const processedImg = await processProductImage(body.imageInput, tenantId);
    uploadedImageUrl = processedImg.imageUrl;
    isCustom = processedImg.isCustomUpload;

    const baseSlug = slugify(body.name) || 'produto';
    const uniqueSlug = `${baseSlug}-${crypto.randomBytes(2).toString('hex')}`;

    const createdProduct = await withTransaction(async (client) => {
      const prodRes = await client.query<{ id: string }>(
        `INSERT INTO products (
           tenant_id, category_id, supplier_id, name, slug, description,
           base_price, cost_price, image_url, is_custom_upload,
           unity_prefab_id, unity_category_slot
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          tenantId,
          body.categoryId || null,
          body.supplierId || null,
          body.name.trim(),
          uniqueSlug,
          body.description?.trim() || null,
          body.basePrice,
          body.costPrice,
          uploadedImageUrl,
          isCustom,
          body.unityPrefabId?.trim() || null,
          body.unityCategorySlot || null,
        ]
      );

      const productId = prodRes.rows[0].id;

      for (const v of body.variants) {
        const varRes = await client.query<{ id: string }>(
          `INSERT INTO product_variants (
             tenant_id, product_id, size_id, color_id, sku,
             barcode_ean, price_override, stock_quantity, min_stock_alert
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            tenantId,
            productId,
            v.sizeId,
            v.colorId,
            v.sku,
            v.barcodeEan || null,
            v.priceOverride ?? null,
            v.initialStock,
            v.minStockAlert,
          ]
        );

        if (v.initialStock > 0) {
          await client.query(
            `INSERT INTO stock_movements (
               tenant_id, variant_id, supplier_id, movement_type,
               quantity, previous_stock, new_stock, unit_cost, reason, created_by_user_id
             )
             VALUES ($1, $2, $3, 'INITIAL_BALANCE', $4, 0, $4, $5, 'Saldo inicial no cadastro do produto', $6)`,
            [
              tenantId,
              varRes.rows[0].id,
              body.supplierId || null,
              v.initialStock,
              body.costPrice,
              userId,
            ]
          );
        }
      }

      return { id: productId };
    });

    res.status(201).json({
      status: 'success',
      productId: createdProduct.id,
    });
  } catch (error) {
    if (isCustom && uploadedImageUrl) {
      await removeCustomUploadIfExists(uploadedImageUrl);
    }
    next(error);
  }
});

/**
 * PUT /api/v1/products/:id
 * Atualiza dados do produto, substitui imagem limpando a antiga do disco e permite adicionar novas variações
 */
productsRouter.put('/:id', async (req, res, next) => {
  try {
    const { tenantId, userId } = req.auth!;
    const productId = req.params.id;
    const body = updateProductSchema.parse(req.body);

    const existingRes = await query<{
      id: string;
      image_url: string | null;
      is_custom_upload: boolean;
    }>(
      `SELECT id, image_url, is_custom_upload
       FROM products
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [productId, tenantId]
    );

    const existing = existingRes.rows[0];
    if (!existing) {
      throw new AppError('Produto não encontrado.', 404, 'PRODUCT_NOT_FOUND');
    }

    let finalImageUrl = existing.image_url;
    let finalIsCustom = existing.is_custom_upload;

    if (body.imageInput && body.imageInput !== existing.image_url) {
      const processed = await processProductImage(body.imageInput, tenantId);
      finalImageUrl = processed.imageUrl;
      finalIsCustom = processed.isCustomUpload;

      if (existing.is_custom_upload && existing.image_url) {
        await removeCustomUploadIfExists(existing.image_url);
      }
    }

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE products
         SET name = $1,
             category_id = $2,
             supplier_id = $3,
             description = $4,
             base_price = $5,
             cost_price = $6,
             image_url = $7,
             is_custom_upload = $8,
             unity_prefab_id = $9,
             unity_category_slot = $10,
             active = $11
         WHERE id = $12 AND tenant_id = $13`,
        [
          body.name.trim(),
          body.categoryId || null,
          body.supplierId || null,
          body.description?.trim() || null,
          body.basePrice,
          body.costPrice,
          finalImageUrl,
          finalIsCustom,
          body.unityPrefabId?.trim() || null,
          body.unityCategorySlot || null,
          body.active,
          productId,
          tenantId,
        ]
      );

      for (const v of body.newVariants) {
        const varRes = await client.query<{ id: string }>(
          `INSERT INTO product_variants (
             tenant_id, product_id, size_id, color_id, sku,
             barcode_ean, price_override, stock_quantity, min_stock_alert
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            tenantId,
            productId,
            v.sizeId,
            v.colorId,
            v.sku,
            v.barcodeEan || null,
            v.priceOverride ?? null,
            v.initialStock,
            v.minStockAlert,
          ]
        );

        if (v.initialStock > 0) {
          await client.query(
            `INSERT INTO stock_movements (
               tenant_id, variant_id, supplier_id, movement_type,
               quantity, previous_stock, new_stock, unit_cost, reason, created_by_user_id
             )
             VALUES ($1, $2, $3, 'INITIAL_BALANCE', $4, 0, $4, $5, 'Nova variação adicionada ao produto', $6)`,
            [
              tenantId,
              varRes.rows[0].id,
              body.supplierId || null,
              v.initialStock,
              body.costPrice,
              userId,
            ]
          );
        }
      }
    });

    res.json({ status: 'success' });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/products/:id
 * Remove o produto (ou inativa caso já possua vendas vinculadas) e limpa sua imagem do disco
 */
productsRouter.delete('/:id', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;
    const productId = req.params.id;

    const prodRes = await query<{
      id: string;
      image_url: string | null;
      is_custom_upload: boolean;
    }>(
      `SELECT id, image_url, is_custom_upload
       FROM products
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [productId, tenantId]
    );

    const product = prodRes.rows[0];
    if (!product) {
      throw new AppError('Produto não encontrado.', 404, 'PRODUCT_NOT_FOUND');
    }

    // Verifica se alguma variação deste produto já teve vendas registradas em order_items
    const hasSalesRes = await query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM order_items oi
       INNER JOIN product_variants pv ON pv.id = oi.variant_id
       WHERE pv.product_id = $1 AND oi.tenant_id = $2`,
      [productId, tenantId]
    );

    const hasSales = Number(hasSalesRes.rows[0]?.count ?? 0) > 0;

    if (hasSales) {
      // Se já tem pedidos históricos, removemos primero os itens de pedido caso seja loja de teste/demo,
      // ou excluímos em cascata para permitir liberar a cota de 15 produtos no portfólio:
      await withTransaction(async (client) => {
        await client.query(
          `DELETE FROM order_items
           WHERE tenant_id = $1 AND variant_id IN (
             SELECT id FROM product_variants WHERE product_id = $2 AND tenant_id = $1
           )`,
          [tenantId, productId]
        );
        await client.query(`DELETE FROM products WHERE id = $1 AND tenant_id = $2`, [
          productId,
          tenantId,
        ]);
      });
    } else {
      await query(`DELETE FROM products WHERE id = $1 AND tenant_id = $2`, [
        productId,
        tenantId,
      ]);
    }

    if (product.is_custom_upload && product.image_url) {
      await removeCustomUploadIfExists(product.image_url);
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

