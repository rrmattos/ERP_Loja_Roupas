import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../config/database';
import { AppError } from '../../shared/errors/AppError';
import { requireAuth } from '../../shared/middlewares/auth.middleware';

export const partnersRouter = Router();

partnersRouter.use(requireAuth);

const customerSchema = z.object({
  name: z.string().min(2, 'Informe o nome do cliente').max(120),
  email: z.string().email('E-mail inválido').max(160).optional().or(z.literal('')),
  phone: z
    .string()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, '').slice(0, 11) : '')),
  document: z
    .string()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, '').slice(0, 14) : '')),
  notes: z.string().max(255).optional().or(z.literal('')),
});

const supplierSchema = z.object({
  name: z.string().min(2, 'Informe o nome do fornecedor').max(120),
  document: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine(
      (v) => v.length === 11 || v.length === 14,
      'Informe um CNPJ (14 números) ou CPF (11 números) válido do fornecedor'
    ),
  email: z.string().email('E-mail inválido').max(160).optional().or(z.literal('')),
  phone: z
    .string()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, '').slice(0, 11) : '')),
  address: z.string().max(255).optional().or(z.literal('')),
  leadTimeDays: z.coerce.number().int().min(1).max(180).default(7),
});

const employeeSchema = z.object({
  name: z.string().min(2, 'Informe o nome do funcionário').max(120),
  document: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine(
      (v) => v.length === 11 || v.length === 14,
      'O CPF (11 números) do funcionário é obrigatório'
    ),
  phone: z
    .string()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, '').slice(0, 11) : '')),
  address: z.string().max(255).optional().or(z.literal('')),
  email: z.string().email('E-mail inválido').max(160).optional().or(z.literal('')),
  jobTitle: z.string().min(2, 'Informe a função / cargo').max(80).default('Vendedor(a)'),
  role: z.enum(['STAFF', 'ADMIN', 'OWNER']).default('STAFF'),
});

/**
 * GET /api/v1/partners/customers
 * Lista todos os clientes da loja com total de compras e valor total gasto
 */
partnersRouter.get('/customers', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;
    const search =
      typeof req.query.search === 'string' && req.query.search.trim() !== ''
        ? `%${req.query.search.trim()}%`
        : null;

    const result = await query(
      `SELECT
         c.id,
         c.name,
         c.email,
         c.phone,
         c.document,
         c.notes,
         c.created_at AS "createdAt",
         COUNT(o.id)::int AS "totalOrders",
         COALESCE(SUM(o.total_amount), 0)::float8 AS "totalSpent",
         MAX(o.created_at) AS "lastPurchaseAt"
       FROM customers c
       LEFT JOIN orders o
         ON o.tenant_id = c.tenant_id
        AND (o.customer_id = c.id OR LOWER(o.customer_name) = LOWER(c.name))
        AND o.status <> 'CANCELLED'
       WHERE c.tenant_id = $1
         AND c.active = TRUE
         AND (
           $2::text IS NULL
           OR c.name ILIKE $2
           OR COALESCE(c.email, '') ILIKE $2
           OR COALESCE(c.phone, '') ILIKE $2
           OR COALESCE(c.document, '') ILIKE $2
         )
       GROUP BY c.id
       ORDER BY "totalSpent" DESC, c.name ASC`,
      [tenantId, search]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/partners/customers
 */
partnersRouter.post('/customers', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;
    const body = customerSchema.parse(req.body);

    const result = await query(
      `INSERT INTO customers (tenant_id, name, email, phone, document, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, phone, document, notes, created_at AS "createdAt"`,
      [
        tenantId,
        body.name.trim(),
        body.email?.trim() || null,
        body.phone?.trim() || null,
        body.document?.trim() || null,
        body.notes?.trim() || null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/partners/customers/:id
 */
partnersRouter.put('/customers/:id', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;
    const customerId = req.params.id;
    const body = customerSchema.parse(req.body);

    const result = await query(
      `UPDATE customers
       SET name = $1,
           email = $2,
           phone = $3,
           document = $4,
           notes = $5,
           updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7
       RETURNING id, name, email, phone, document, notes`,
      [
        body.name.trim(),
        body.email?.trim() || null,
        body.phone?.trim() || null,
        body.document?.trim() || null,
        body.notes?.trim() || null,
        customerId,
        tenantId,
      ]
    );

    if (!result.rows[0]) {
      throw new AppError('Cliente não encontrado.', 404, 'CUSTOMER_NOT_FOUND');
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/partners/customers/:id
 */
partnersRouter.delete('/customers/:id', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;
    const customerId = req.params.id;

    await query(`DELETE FROM customers WHERE id = $1 AND tenant_id = $2`, [
      customerId,
      tenantId,
    ]);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/partners/suppliers
 * Lista todos os fornecedores com contagem de produtos e entregas realizadas
 */
partnersRouter.get('/suppliers', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;
    const search =
      typeof req.query.search === 'string' && req.query.search.trim() !== ''
        ? `%${req.query.search.trim()}%`
        : null;

    const result = await query(
      `SELECT
         s.id,
         s.name,
         s.document,
         s.email,
         s.phone,
         s.address,
         s.lead_time_days AS "leadTimeDays",
         s.created_at AS "createdAt",
         (SELECT COUNT(*)::int FROM products p WHERE p.supplier_id = s.id AND p.tenant_id = s.tenant_id) AS "productsCount",
         (SELECT COUNT(*)::int FROM stock_movements sm WHERE sm.supplier_id = s.id AND sm.tenant_id = s.tenant_id) AS "entriesCount"
       FROM suppliers s
       WHERE s.tenant_id = $1
         AND s.active = TRUE
         AND (
           $2::text IS NULL
           OR s.name ILIKE $2
           OR COALESCE(s.document, '') ILIKE $2
           OR COALESCE(s.email, '') ILIKE $2
           OR COALESCE(s.phone, '') ILIKE $2
           OR COALESCE(s.address, '') ILIKE $2
         )
       ORDER BY s.name ASC`,
      [tenantId, search]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/partners/suppliers
 */
partnersRouter.post('/suppliers', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;
    const body = supplierSchema.parse(req.body);

    const result = await query(
      `INSERT INTO suppliers (tenant_id, name, document, email, phone, address, lead_time_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, document, email, phone, address, lead_time_days AS "leadTimeDays", created_at AS "createdAt"`,
      [
        tenantId,
        body.name.trim(),
        body.document || null,
        body.email?.trim() || null,
        body.phone || null,
        body.address?.trim() || null,
        body.leadTimeDays,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/partners/suppliers/:id
 */
partnersRouter.put('/suppliers/:id', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;
    const supplierId = req.params.id;
    const body = supplierSchema.parse(req.body);

    const result = await query(
      `UPDATE suppliers
       SET name = $1,
           document = $2,
           email = $3,
           phone = $4,
           address = $5,
           lead_time_days = $6,
           updated_at = NOW()
       WHERE id = $7 AND tenant_id = $8
       RETURNING id, name, document, email, phone, address, lead_time_days AS "leadTimeDays"`,
      [
        body.name.trim(),
        body.document || null,
        body.email?.trim() || null,
        body.phone || null,
        body.address?.trim() || null,
        body.leadTimeDays,
        supplierId,
        tenantId,
      ]
    );

    if (!result.rows[0]) {
      throw new AppError('Fornecedor não encontrado.', 404, 'SUPPLIER_NOT_FOUND');
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/partners/suppliers/:id
 */
partnersRouter.delete('/suppliers/:id', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;
    const supplierId = req.params.id;

    await query(`DELETE FROM suppliers WHERE id = $1 AND tenant_id = $2`, [
      supplierId,
      tenantId,
    ]);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/partners/employees
 * Lista todos os funcionários / vendedores da loja com total de vendas e movimentações
 */
partnersRouter.get('/employees', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;
    const search =
      typeof req.query.search === 'string' && req.query.search.trim() !== ''
        ? `%${req.query.search.trim()}%`
        : null;

    const result = await query(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.phone,
         u.document,
         u.address,
         COALESCE(u.job_title, 'Vendedor(a)') AS "jobTitle",
         u.role,
         u.created_at AS "createdAt",
         (
           SELECT COUNT(*)::int
           FROM orders o
           WHERE o.tenant_id = u.tenant_id
             AND o.created_by_user_id = u.id
             AND o.status <> 'CANCELLED'
         ) AS "salesCount",
         (
           SELECT COALESCE(SUM(o.total_amount), 0)::float8
           FROM orders o
           WHERE o.tenant_id = u.tenant_id
             AND o.created_by_user_id = u.id
             AND o.status <> 'CANCELLED'
         ) AS "salesRevenue",
         (
           SELECT COUNT(*)::int
           FROM stock_movements sm
           WHERE sm.tenant_id = u.tenant_id
             AND sm.created_by_user_id = u.id
         ) AS "movementsCount"
       FROM users u
       WHERE u.tenant_id = $1
         AND u.active = TRUE
         AND (
           $2::text IS NULL
           OR u.name ILIKE $2
           OR COALESCE(u.document, '') ILIKE $2
           OR COALESCE(u.phone, '') ILIKE $2
           OR COALESCE(u.email, '') ILIKE $2
           OR COALESCE(u.job_title, '') ILIKE $2
           OR COALESCE(u.address, '') ILIKE $2
         )
       ORDER BY "salesRevenue" DESC, u.name ASC`,
      [tenantId, search]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/partners/employees
 * Cadastra um novo funcionário / vendedor na loja
 */
partnersRouter.post('/employees', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;
    const body = employeeSchema.parse(req.body);

    const generatedEmail =
      body.email && body.email.trim() !== ''
        ? body.email.trim().toLowerCase()
        : `func.${crypto.randomBytes(4).toString('hex')}@loja.com`;

    const defaultPasswordHash = await bcrypt.hash(
      crypto.randomBytes(12).toString('hex'),
      10
    );

    const result = await query(
      `INSERT INTO users (tenant_id, name, email, phone, document, address, job_title, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING
         id,
         name,
         email,
         phone,
         document,
         address,
         job_title AS "jobTitle",
         role,
         created_at AS "createdAt"`,
      [
        tenantId,
        body.name.trim(),
        generatedEmail,
        body.phone || null,
        body.document || null,
        body.address?.trim() || null,
        body.jobTitle.trim(),
        defaultPasswordHash,
        body.role,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/partners/employees/:id
 * Atualiza dados de um funcionário da loja
 */
partnersRouter.put('/employees/:id', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;
    const employeeId = req.params.id;
    const body = employeeSchema.parse(req.body);

    const result = await query(
      `UPDATE users
       SET name = $1,
           phone = $2,
           document = $3,
           address = $4,
           job_title = $5,
           role = $6,
           email = CASE WHEN $7::text IS NOT NULL AND $7 <> '' THEN LOWER($7) ELSE email END,
           updated_at = NOW()
       WHERE id = $8 AND tenant_id = $9
       RETURNING
         id,
         name,
         email,
         phone,
         document,
         address,
         job_title AS "jobTitle",
         role`,
      [
        body.name.trim(),
        body.phone || null,
        body.document || null,
        body.address?.trim() || null,
        body.jobTitle.trim(),
        body.role,
        body.email?.trim() || null,
        employeeId,
        tenantId,
      ]
    );

    if (!result.rows[0]) {
      throw new AppError('Funcionário não encontrado.', 404, 'EMPLOYEE_NOT_FOUND');
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/partners/employees/:id
 * Desativa/remove um funcionário (impedindo excluir o último usuário ativo da loja)
 */
partnersRouter.delete('/employees/:id', async (req, res, next) => {
  try {
    const { tenantId } = req.auth!;
    const employeeId = req.params.id;

    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM users WHERE tenant_id = $1 AND active = TRUE`,
      [tenantId]
    );

    if (Number(countRes.rows[0]?.count ?? 0) <= 1) {
      throw new AppError(
        'A loja precisa manter pelo menos 1 funcionário/responsável ativo.',
        400,
        'CANNOT_DELETE_LAST_EMPLOYEE'
      );
    }

    await query(
      `UPDATE users SET active = FALSE, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [employeeId, tenantId]
    );

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});


