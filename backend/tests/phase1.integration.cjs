// Run against an isolated database named erp_phase1; never uses the project .env.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

async function main() {
  Object.assign(process.env, {
    NODE_ENV: 'development', APP_MODE: 'portfolio_sandbox',
    DATABASE_URL: 'postgresql://postgres:phase1_test_only@127.0.0.1:55439/erp_phase1',
    JWT_ACCESS_SECRET: crypto.randomBytes(32).toString('hex'),
    JWT_REFRESH_SECRET: crypto.randomBytes(32).toString('hex'),
    ADMIN_EMAIL: 'owner@phase1.test', ADMIN_PASSWORD: 'Phase1OwnerPassword!',
    UNITY_DEFAULT_API_KEY: crypto.randomBytes(24).toString('hex'),
    CORS_ORIGIN: 'http://localhost:5173', MAX_UPLOAD_SIZE_KB: '2048',
  });
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'erp-phase1-'));
  const originalCwd = process.cwd();
  await fs.mkdir(path.join(temp, 'database/init'), { recursive: true });
  await fs.copyFile(path.resolve(__dirname, '../../database/init/02_seed.sql'), path.join(temp, 'database/init/02_seed.sql'));
  process.chdir(temp);
  const { dbPool, query } = require('../dist/config/database');
  const { bootstrapInitialTenants } = require('../dist/jobs/bootstrap');
  const { app } = require('../dist/app');
  const { signAccessToken } = require('../dist/shared/utils/jwt');
  const { cleanupExpiredSandboxes, resetPublicDemoStore } = require('../dist/jobs/sandboxCleanup.job');
  const { hasProfanity } = require('../dist/shared/middlewares/profanityFilter');
  let server;
  let count = 0;
  async function test(name, fn) { await fn(); count++; console.log(`PASS ${name}`); }
  try {
    assert.equal((await query('SELECT current_database() AS name')).rows[0].name, 'erp_phase1');
    await query(await fs.readFile(path.resolve(__dirname, '../../database/init/01_schema.sql'), 'utf8'));
    await query('TRUNCATE tenants CASCADE');
    await bootstrapInitialTenants();
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    async function request(endpoint, { token, body, method = 'GET', raw, headers = {} } = {}) {
      const response = await fetch(base + endpoint, { method, headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body || raw ? { 'Content-Type': 'application/json' } : {}), ...headers,
      }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
      return { status: response.status, body: await response.json().catch(() => null), cookie: response.headers.get('set-cookie') };
    }
    let demo, sandbox;
    await test('texto: palavras comuns, texto longo e campos técnicos', async () => {
      for (const text of ['Paulo', 'computador', 'masculino', 'custo', 'vestido', 'pato', 'São Paulo']) assert.equal(hasProfanity(text), false, text);
      assert.equal(hasProfanity('a '.repeat(501) + 'merda'), true);
      assert.equal(hasProfanity('merda!'), true);
      assert.equal(hasProfanity('https://example.test merda'), true);
      assert.equal(hasProfanity('data:image/webp;base64,cHV0YQ=='), false);
      const result = await request('/auth/sandbox-register', { method: 'POST', body: {
        storeName: 'Loja Paulo', ownerName: 'Paulo Silva', email: 'merda@phase1.test',
        password: 'merdaSenhaForte!2026', document: '12345678901',
      }});
      assert.equal(result.status, 201, JSON.stringify(result.body)); sandbox = result.body;
      assert.equal(sandbox.user.role, 'OWNER');
    });
    await test('login demo rápido e refresh sem senha', async () => {
      const result = await request('/auth/demo-login', { method: 'POST' });
      assert.equal(result.status, 200, JSON.stringify(result.body)); demo = result.body;
      assert.equal(demo.tenant.isDemo, true);
      const refreshed = await request('/auth/refresh', { method: 'POST', headers: { Cookie: result.cookie.split(';')[0] } });
      assert.equal(refreshed.status, 200);
    });
    await test('sandbox: seed, login com senha e isolamento comercial', async () => {
      const login = await request('/auth/login', { method: 'POST', body: { email: 'merda@phase1.test', password: 'merdaSenhaForte!2026', tenantSlug: sandbox.tenant.slug } });
      assert.equal(login.status, 200);
      assert.equal((await query('SELECT COUNT(*)::int AS n FROM products WHERE tenant_id = $1', [sandbox.tenant.id])).rows[0].n, 2);
      const hashes = await query('SELECT password_hash FROM users WHERE tenant_id = $1', [sandbox.tenant.id]);
      assert.equal(new Set(hashes.rows.map(row => row.password_hash)).size, 3);
      const official = (await query("SELECT id FROM tenants WHERE slug = 'loja-oficial'")).rows[0].id;
      await query('SELECT seed_tenant_catalog($1, TRUE)', [official]);
      assert.equal((await query('SELECT COUNT(*)::int AS n FROM products WHERE tenant_id = $1', [official])).rows[0].n, 0);
      assert.equal((await query('SELECT COUNT(*)::int AS n FROM users WHERE tenant_id = $1', [official])).rows[0].n, 1);
    });
    const staff = (await query("SELECT id FROM users WHERE tenant_id = $1 AND role = 'STAFF' LIMIT 1", [sandbox.tenant.id])).rows[0];
    const staffToken = signAccessToken({ sub: staff.id, tenantId: sandbox.tenant.id, role: 'STAFF', isDemo: false, isSandbox: true });
    await test('STAFF não promove cargo nem altera perfil; proprietário protegido', async () => {
      assert.equal((await request('/partners/employees/' + staff.id, { token: staffToken, method: 'PUT', body: {} })).status, 403);
      assert.equal((await request('/auth/store-profile', { token: staffToken, method: 'PUT', body: {} })).status, 403);
      assert.equal((await request('/partners/employees/' + sandbox.user.id, { token: sandbox.accessToken, method: 'DELETE' })).status, 403);
    });
    await test('cargos atuais prevalecem sobre JWT; ADMIN gerencia apenas STAFF', async () => {
      const body = { name: 'Paulo Silva', document: '12345678901', jobTitle: 'Gerente de Loja', role: 'ADMIN' };
      const promoted = await request('/partners/employees/' + staff.id, { token: sandbox.accessToken, method: 'PUT', body });
      assert.equal(promoted.status, 200, JSON.stringify(promoted.body));
      assert.equal((await request('/partners/employees', { token: staffToken, method: 'POST', body })).status, 403);
      const created = await request('/partners/employees', { token: staffToken, method: 'POST', body: { ...body, role: 'STAFF' } });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const staleAdmin = signAccessToken({ sub: staff.id, tenantId: sandbox.tenant.id, role: 'ADMIN', isDemo: false, isSandbox: true });
      await query("UPDATE users SET role = 'STAFF' WHERE id = $1", [staff.id]);
      assert.equal((await request('/auth/store-profile', { token: staleAdmin, method: 'PUT', body: {} })).status, 403);
    });
    const meta = (await request('/products/metadata', { token: sandbox.accessToken })).body;
    const foreignMeta = (await request('/products/metadata', { token: demo.accessToken })).body;
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=';
    const makeProduct = (overrides = {}) => ({ name: 'Vestido Paulo', description: 'Vestido masculino para computador',
      basePrice: 99, costPrice: 20, categoryId: meta.categories[0].id, supplierId: meta.suppliers[0].id,
      imageInput: image, variants: [{ sizeId: meta.sizes[0].id, colorId: meta.colors[0].id, sku: 'TEST-' + crypto.randomUUID(), initialStock: 1 }], ...overrides });
    let productId, oldUrl;
    await test('FK de outra loja rejeitada antes de gravar arquivo', async () => {
      const result = await request('/products', { token: sandbox.accessToken, method: 'POST', body: makeProduct({ categoryId: foreignMeta.categories[0].id }) });
      assert.equal(result.status, 422, JSON.stringify(result.body));
      assert.equal(await fs.readdir(path.join(temp, 'uploads')).catch(() => []).then(files => files.length), 0);
    });
    await test('upload válido, MIME falso, PNG truncado e limite binário', async () => {
      for (const bad of [image.replace('image/png', 'image/jpeg'), 'data:image/png;base64,' + Buffer.from([137,80,78,71,0,0,0,0,0,0,0,0]).toString('base64')]) {
        assert.equal((await request('/products', { token: sandbox.accessToken, method: 'POST', body: makeProduct({ imageInput: bad }) })).status, 400);
      }
      const large = 'data:image/png;base64,' + Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64');
      assert.equal((await request('/products', { token: sandbox.accessToken, method: 'POST', body: makeProduct({ imageInput: large }) })).status, 413);
      const result = await request('/products', { token: sandbox.accessToken, method: 'POST', body: makeProduct() });
      assert.equal(result.status, 201, JSON.stringify(result.body)); productId = result.body.productId;
      oldUrl = (await query('SELECT image_url FROM products WHERE id = $1', [productId])).rows[0].image_url;
      assert.ok(oldUrl.includes(sandbox.tenant.id));
      await fs.access(path.join(temp, oldUrl));
    });
    await test('outra loja não pode reutilizar nem apagar upload', async () => {
      const result = await request('/products', { token: demo.accessToken, method: 'POST', body: makeProduct({ categoryId: foreignMeta.categories[0].id, supplierId: foreignMeta.suppliers[0].id,
        variants: [{ sizeId: foreignMeta.sizes[0].id, colorId: foreignMeta.colors[0].id, sku: 'OTHER-STORE', initialStock: 0 }], imageInput: oldUrl }) });
      assert.equal(result.status, 400, JSON.stringify(result.body));
      await fs.access(path.join(temp, oldUrl));
    });
    await test('rollback preserva arquivo antigo e limpa somente arquivo novo', async () => {
      await query(`CREATE FUNCTION phase1_fail_product() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name = 'Forcar rollback' THEN RAISE EXCEPTION 'phase1 rollback'; END IF; RETURN NEW; END $$`);
      await query('CREATE TRIGGER phase1_fail BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION phase1_fail_product()');
      const before = await fs.readdir(path.join(temp, 'uploads'));
      const result = await request('/products/' + productId, { token: sandbox.accessToken, method: 'PUT', body: { ...makeProduct(), name: 'Forcar rollback', existingVariants: [], newVariants: [] } });
      assert.equal(result.status, 500);
      await fs.access(path.join(temp, oldUrl));
      assert.deepEqual(await fs.readdir(path.join(temp, 'uploads')), before);
      assert.equal((await query('SELECT image_url FROM products WHERE id = $1', [productId])).rows[0].image_url, oldUrl);
      await query('DROP TRIGGER phase1_fail ON products'); await query('DROP FUNCTION phase1_fail_product()');
    });
    await test('substituição após commit apaga antiga; exclusão apaga nova', async () => {
      const result = await request('/products/' + productId, { token: sandbox.accessToken, method: 'PUT', body: { ...makeProduct(), existingVariants: [], newVariants: [] } });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      await assert.rejects(fs.access(path.join(temp, oldUrl)));
      const newUrl = (await query('SELECT image_url FROM products WHERE id = $1', [productId])).rows[0].image_url;
      await fs.access(path.join(temp, newUrl));
      assert.equal((await request('/products/' + productId, { token: sandbox.accessToken, method: 'DELETE' })).status, 204);
      await assert.rejects(fs.access(path.join(temp, newUrl)));
    });
    await test('logos: rollback preserva antiga, compartilhamento preserva referência e substituição limpa disco', async () => {
      const profile = { name: 'Loja Paulo', document: '12345678901', logoInput: image };
      const first = await request('/auth/store-profile', { token: sandbox.accessToken, method: 'PUT', body: profile });
      assert.equal(first.status, 200, JSON.stringify(first.body));
      const logo = first.body.logoUrl;
      const shared = await request('/products', { token: sandbox.accessToken, method: 'POST', body: makeProduct({ imageInput: logo }) });
      assert.equal(shared.status, 201, JSON.stringify(shared.body));
      assert.equal((await request('/auth/store-profile', { token: sandbox.accessToken, method: 'PUT', body: { ...profile, logoInput: null } })).status, 200);
      await fs.access(path.join(temp, logo));
      assert.equal((await request('/products/' + shared.body.productId, { token: sandbox.accessToken, method: 'DELETE' })).status, 204);
      await assert.rejects(fs.access(path.join(temp, logo)));
      const next = await request('/auth/store-profile', { token: sandbox.accessToken, method: 'PUT', body: profile });
      assert.equal(next.status, 200);
      await query(`CREATE FUNCTION phase1_fail_logo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name = 'Forcar rollback' THEN RAISE EXCEPTION 'phase1 logo rollback'; END IF; RETURN NEW; END $$`);
      await query('CREATE TRIGGER phase1_fail BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION phase1_fail_logo()');
      const before = await fs.readdir(path.join(temp, 'uploads'));
      assert.equal((await request('/auth/store-profile', { token: sandbox.accessToken, method: 'PUT', body: { ...profile, name: 'Forcar rollback' } })).status, 500);
      await fs.access(path.join(temp, next.body.logoUrl));
      assert.deepEqual(await fs.readdir(path.join(temp, 'uploads')), before);
      await query('DROP TRIGGER phase1_fail ON tenants'); await query('DROP FUNCTION phase1_fail_logo()');
      const last = await request('/auth/store-profile', { token: sandbox.accessToken, method: 'PUT', body: profile });
      assert.equal(last.status, 200);
      await assert.rejects(fs.access(path.join(temp, next.body.logoUrl)));
    });
    await test('cota de produtos não pode ser ultrapassada por envios concorrentes', async () => {
      const current = (await query('SELECT COUNT(*)::int AS n FROM products WHERE tenant_id = $1', [sandbox.tenant.id])).rows[0].n;
      await query('UPDATE tenants SET max_products = $1 WHERE id = $2', [current + 1, sandbox.tenant.id]);
      const results = await Promise.all([1, 2].map(() => request('/products', { token: sandbox.accessToken, method: 'POST', body: makeProduct() })));
      assert.deepEqual(results.map(r => r.status).sort(), [201, 403]);
      assert.equal((await query('SELECT COUNT(*)::int AS n FROM products WHERE tenant_id = $1', [sandbox.tenant.id])).rows[0].n, current + 1);
    });
    await test('reset demo mantém login rápido e sandbox expirada é removida', async () => {
      await resetPublicDemoStore();
      assert.equal((await request('/auth/demo-login', { method: 'POST' })).status, 200);
      await query("UPDATE tenants SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1", [sandbox.tenant.id]);
      await cleanupExpiredSandboxes();
      assert.equal((await query('SELECT id FROM tenants WHERE id = $1', [sandbox.tenant.id])).rowCount, 0);
      assert.deepEqual(await fs.readdir(path.join(temp, 'uploads')), []);
    });
    await test('modo comercial desativa acesso público e mantém limpeza de tokens', async () => {
      const { env } = require('../dist/config/env');
      env.isPortfolioSandbox = false;
      try {
        assert.equal((await request('/auth/demo-login', { method: 'POST' })).status, 403);
        await query("UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL '2 days'");
        await cleanupExpiredSandboxes();
        assert.equal((await query('SELECT id FROM refresh_tokens')).rowCount, 0);
      } finally { env.isPortfolioSandbox = true; }
    });
    await test('erros JSON/body e limites do pool', async () => {
      assert.equal((await request('/auth/login', { method: 'POST', raw: '{' })).status, 400);
      assert.equal((await request('/auth/login', { method: 'POST', raw: ' '.repeat(3 * 1024 * 1024 + 1) })).status, 413);
      assert.equal(dbPool.options.max, 5);
      assert.equal((await query('SHOW statement_timeout')).rows[0].statement_timeout, '10s');
    });
    console.log(`${count} integration groups passed`);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await dbPool.end(); process.chdir(originalCwd);
    const resolved = await fs.realpath(temp);
    assert.equal(path.dirname(resolved).toLowerCase(), (await fs.realpath(os.tmpdir())).toLowerCase());
    assert.ok(path.basename(resolved).startsWith('erp-phase1-'));
    await fs.rm(resolved, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
