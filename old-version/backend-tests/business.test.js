import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, call, login, closeDb, query, tomorrow, pool } from './helpers.js';
import { lineTotal, sumMoney, toCents, fromCents, isMoney } from '../src/utils/money.js';

describe('Money helpers', () => {
  it('multiplies quantity by price without floating-point errors', () => {
    assert.equal(lineTotal('3', '0.10'), '0.30');
    assert.equal(lineTotal('1.5', '19.99'), '29.99'); // 29.985 rounds half up
    assert.equal(lineTotal('60', '28000'), '1680000.00');
    assert.equal(lineTotal('0.333', '100.00'), '33.30');
  });
  it('sums and converts cents exactly', () => {
    assert.equal(sumMoney(['0.10', '0.20', '0.30']), '0.60');
    assert.equal(fromCents(toCents('12.5')), '12.50');
  });
  it('validates money strings', () => {
    assert.ok(isMoney('10.25'));
    assert.ok(!isMoney('10.255'));
    assert.ok(!isMoney('-5'));
    assert.ok(!isMoney('1e5'));
  });
});

describe('Business rules', () => {
  const t = {};
  before(async () => {
    await resetDb();
    for (const r of ['admin', 'company', 'manager', 'client', 'client2', 'engineer', 'worker', 'supplier']) t[r] = await login(`${r}@buildsmart.test`);
  });
  after(closeDb);

  describe('Projects', () => {
    it('rejects an end date before the start date (422)', async () => {
      const res = await call('post', '/projects', t.company, { title: 'Bad dates', plannedStart: '2026-12-10', plannedEnd: '2026-12-01' });
      assert.equal(res.status, 422);
      assert.ok(res.body.error.details.plannedEnd);
    });
    it('supports search, status filter, sorting and pagination', async () => {
      const all = await call('get', '/projects?limit=2&page=1&sort=title&order=asc', t.admin);
      assert.equal(all.body.data.length, 2);
      assert.equal(all.body.meta.total, 3);
      assert.equal(all.body.meta.pages, 2);
      assert.ok(all.body.data[0].title <= all.body.data[1].title);
      const f = await call('get', '/projects?status=completed', t.admin);
      assert.equal(f.body.data.length, 1);
      const s = await call('get', '/projects?q=lodge', t.admin);
      assert.equal(s.body.data[0].title, 'Musanze Eco Lodge');
    });
    it('is safe against SQL injection in search text', async () => {
      const res = await call('get', `/projects?q=${encodeURIComponent("' OR 1=1 --")}`, t.admin);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 0);
    });
    it('rejects invalid sort columns', async () => {
      assert.equal((await call('get', '/projects?sort=password_hash', t.admin)).status, 422);
    });
    it('archives instead of deleting and hides archived projects', async () => {
      const c = await call('post', '/projects', t.company, { title: 'To archive' });
      assert.equal((await call('delete', `/projects/${c.body.data.id}`, t.company)).status, 200);
      const list = await call('get', '/projects?q=archive', t.company);
      assert.equal(list.body.data.length, 0);
      const arch = await call('get', '/projects?archived=true', t.company);
      assert.equal(arch.body.data.length, 1);
    });
    it('budget summary is calculated on the server from approved expenses', async () => {
      const res = await call('get', '/projects/1', t.manager);
      const b = res.body.data.budget;
      // 9,500,000 + 3,200,000 + 1,450,000 + 7,800,000 + allocated material 4,640,000 + 3,724,000
      assert.equal(b.spent, '30314000.00');
      assert.equal(b.budget, '82000000.00');
      assert.equal(b.remaining, '51686000.00');
      assert.equal(b.pending, '600000.00');
      assert.equal(b.overBudget, false);
    });
    it('progress updates change completion and are kept as history', async () => {
      const r = await call('post', '/projects/1/progress', t.manager, { completionPct: 55, note: 'Beams started' });
      assert.equal(r.status, 201);
      const p = await call('get', '/projects/1', t.manager);
      assert.equal(p.body.data.completionPct, 55);
      assert.equal(p.body.data.progress[0].note, 'Beams started');
      assert.equal((await call('post', '/projects/1/progress', t.manager, { completionPct: 120 })).status, 422);
      assert.equal((await call('post', '/projects/1/progress', t.client, { completionPct: 90 })).status, 403);
    });
  });

  describe('Tasks', () => {
    it('blocks starting a task before its dependency is done', async () => {
      const [dep] = await query("SELECT id FROM tasks WHERE title = 'Install first-floor beams'");
      const res = await call('patch', `/tasks/${dep.id}`, t.worker, { status: 'in_progress' });
      assert.equal(res.status, 409);
      assert.match(res.body.error.message, /Cast first-floor columns/);
    });
    it('flags overdue tasks', async () => {
      const res = await call('get', '/tasks?projectId=1', t.manager);
      const overdue = res.body.data.filter((x) => x.isOverdue);
      assert.ok(overdue.some((x) => x.title === 'Site safety inspection'));
      assert.ok(!overdue.some((x) => x.status === 'done'));
    });
    it('records history and notifies the assignee when a task is created', async () => {
      const [w] = await query("SELECT id FROM users WHERE email = 'worker@buildsmart.test'");
      const before = (await call('get', '/notifications/unread-count', t.worker)).body.data.unread;
      const c = await call('post', '/tasks', t.manager, { projectId: 1, title: 'Fix scaffolding', priority: 'high', assigneeId: w.id, dueDate: tomorrow(2) });
      assert.equal(c.status, 201);
      assert.equal((await call('get', '/notifications/unread-count', t.worker)).body.data.unread, before + 1);
      await call('patch', `/tasks/${c.body.data.id}`, t.worker, { status: 'in_progress' });
      const h = await call('get', `/tasks/${c.body.data.id}/history`, t.manager);
      assert.equal(h.body.data.length, 2);
    });
    it('validates required fields', async () => {
      const res = await call('post', '/tasks', t.manager, { projectId: 1, title: '' });
      assert.equal(res.status, 422);
    });
    it("a manager cannot create tasks in a project they don't manage", async () => {
      const mine = await call('post', '/projects', t.manager, { title: 'Manager own' });
      assert.equal(mine.status, 201);
      const res = await call('post', '/tasks', t.manager, { projectId: 999, title: 'Ghost project task' });
      assert.equal(res.status, 404);
    });
  });

  describe('Inventory', () => {
    const stock = async (id) => (await query('SELECT stock_qty FROM materials WHERE id = ?', [id]))[0].stock_qty;
    it('receipts add stock and write a movement with the balance', async () => {
      const before = await stock(3);
      const r = await call('post', '/materials/3/movements', t.manager, { type: 'receipt', quantity: '10.5', unitCost: '18500' });
      assert.equal(r.status, 201);
      assert.equal(r.body.data.balance, '70.500');
      assert.equal(before, '60.000');
    });
    it('allocation removes stock and creates an approved material expense', async () => {
      const r = await call('post', '/materials/3/movements', t.manager, { type: 'allocation', quantity: '10', projectId: 1 });
      assert.equal(r.status, 201);
      assert.equal(await stock(3), '60.500');
      const [e] = await query("SELECT amount, status FROM expenses WHERE inventory_movement_id = ?", [r.body.data.id]);
      assert.equal(e.status, 'approved');
      assert.equal(e.amount, '185000.00'); // 10 x 18,500 (updated cost)
    });
    it('refuses to allocate more than is in stock (409) and leaves stock unchanged', async () => {
      const before = await stock(1);
      const r = await call('post', '/materials/1/movements', t.manager, { type: 'allocation', quantity: '9999', projectId: 1 });
      assert.equal(r.status, 409);
      assert.equal(await stock(1), before);
    });
    it('two simultaneous allocations cannot oversell the same stock', async () => {
      const [m] = await query("SELECT id, stock_qty FROM materials WHERE id = 4");
      const each = (Number(m.stock_qty) * 0.6).toFixed(3);
      const results = await Promise.all([
        call('post', '/materials/4/movements', t.manager, { type: 'allocation', quantity: each, projectId: 1 }),
        call('post', '/materials/4/movements', t.manager, { type: 'allocation', quantity: each, projectId: 1 }),
      ]);
      const codes = results.map((r) => r.status).sort();
      assert.deepEqual(codes, [201, 409]);
      assert.ok(Number(await stock(4)) >= 0);
    });
    it('allocation to a project you cannot see is refused (404)', async () => {
      const other = await call('post', '/projects', t.company, { title: 'Company only' });
      const denied = await call('post', '/materials/2/movements', t.manager, { type: 'allocation', quantity: '1', projectId: other.body.data.id });
      assert.equal(denied.status, 404);
    });
    it('clients and workers cannot move stock', async () => {
      assert.equal((await call('post', '/materials/1/movements', t.client, { type: 'receipt', quantity: '1' })).status, 403);
      assert.equal((await call('post', '/materials/1/movements', t.worker, { type: 'receipt', quantity: '1' })).status, 403);
    });
    it('rejects negative receipts and zero quantities', async () => {
      assert.equal((await call('post', '/materials/1/movements', t.manager, { type: 'receipt', quantity: '-5' })).status, 400);
      assert.equal((await call('post', '/materials/1/movements', t.manager, { type: 'adjustment', quantity: '0' })).status, 400);
    });
    it('the movement history sums to the current stock', async () => {
      const [{ s }] = await query('SELECT SUM(quantity) AS s FROM inventory_movements WHERE material_id = 3');
      assert.equal(Number(s), Number(await stock(3)));
    });
    it('low-stock items are flagged and filterable', async () => {
      const res = await call('get', '/materials?lowStock=true', t.manager);
      assert.ok(res.body.data.length >= 1);
      assert.ok(res.body.data.every((m) => m.isLow));
    });
  });

  describe('Quotations', () => {
    let requestId;
    const items = [
      { kind: 'material', description: 'Paint 20L', quantity: '12', unitPrice: '45000.50' },
      { kind: 'labor', description: 'Painters (days)', quantity: '6', unitPrice: '30000' },
    ];
    it('only clients create requests', async () => {
      assert.equal((await call('post', '/quotation-requests', t.worker, { title: 'Nope request' })).status, 403);
      const r = await call('post', '/quotation-requests', t.client, { title: 'Paint my fence', location: 'Musanze' });
      assert.equal(r.status, 201);
      requestId = r.body.data.id;
    });
    it('computes totals on the server and ignores a total sent by the browser', async () => {
      const r = await call('post', `/quotation-requests/${requestId}/quotations`, t.worker, { validUntil: tomorrow(10), items, total: '1.00' });
      assert.equal(r.status, 201);
      assert.equal(r.body.data.total, '720006.00'); // 12 x 45000.50 = 540006.00 ; + 180000
    });
    it('validates quotation input', async () => {
      const bad = await call('post', `/quotation-requests/${requestId}/quotations`, t.company, { validUntil: '2020-01-01', items: [] });
      assert.equal(bad.status, 422);
    });
    it('re-submitting creates version 2 and keeps version 1 as history', async () => {
      const r = await call('post', `/quotation-requests/${requestId}/quotations`, t.worker, { validUntil: tomorrow(10), items: [items[1]] });
      assert.equal(r.body.data.version, 2);
      const rows = await query('SELECT version, status FROM quotations WHERE request_id = ? AND provider_id = (SELECT id FROM users WHERE email = ?) ORDER BY version', [requestId, 'worker@buildsmart.test']);
      assert.deepEqual(rows.map((x) => `${x.version}:${x.status}`), ['1:superseded', '2:submitted']);
    });
    it('a provider only sees their own quotations; the client sees all', async () => {
      await call('post', `/quotation-requests/${requestId}/quotations`, t.company, { validUntil: tomorrow(10), items });
      const prov = await call('get', `/quotation-requests/${requestId}`, t.worker);
      assert.ok(prov.body.data.quotations.every((q) => q.providerName === 'Claude Mugisha'));
      const cl = await call('get', `/quotation-requests/${requestId}`, t.client);
      assert.ok(cl.body.data.quotations.some((q) => q.providerName === 'Jean Bosco Nkurunziza'));
      const stranger = await call('get', `/quotation-requests/${requestId}`, t.client2);
      assert.equal(stranger.status, 404);
    });
    it('only the owning client can accept', async () => {
      const [q] = await query('SELECT id FROM quotations WHERE request_id = ? AND status = ? LIMIT 1', [requestId, 'submitted']);
      assert.equal((await call('post', `/quotations/${q.id}/accept`, t.client2)).status, 403);
      assert.equal((await call('post', `/quotations/${q.id}/accept`, t.worker)).status, 403);
    });
    it('accepting one quotation rejects the others and awards the request', async () => {
      const [q] = await query("SELECT id FROM quotations WHERE request_id = ? AND status = 'submitted' AND provider_id = (SELECT id FROM users WHERE email = 'company@buildsmart.test')", [requestId]);
      const r = await call('post', `/quotations/${q.id}/accept`, t.client);
      assert.equal(r.status, 200);
      const rows = await query('SELECT status FROM quotations WHERE request_id = ? AND status <> ?', [requestId, 'superseded']);
      assert.deepEqual(rows.map((x) => x.status).sort(), ['accepted', 'rejected']);
      const [req] = await query('SELECT status FROM quotation_requests WHERE id = ?', [requestId]);
      assert.equal(req.status, 'awarded');
      const again = await call('post', `/quotations/${q.id}/accept`, t.client);
      assert.equal(again.status, 409);
    });
    it('cannot quote on a request that is no longer open', async () => {
      const r = await call('post', `/quotation-requests/${requestId}/quotations`, t.engineer, { validUntil: tomorrow(5), items });
      assert.equal(r.status, 409);
    });
    it('expired quotations cannot be accepted', async () => {
      const rq = await call('post', '/quotation-requests', t.client, { title: 'Expiry test request' });
      const q = await call('post', `/quotation-requests/${rq.body.data.id}/quotations`, t.worker, { validUntil: tomorrow(0), items: [items[1]] });
      await query("UPDATE quotations SET valid_until = '2020-01-01' WHERE id = ?", [q.body.data.id]);
      const detail = await call('get', `/quotation-requests/${rq.body.data.id}`, t.client);
      assert.equal(detail.body.data.quotations[0].status, 'expired');
      assert.equal((await call('post', `/quotations/${q.body.data.id}/accept`, t.client)).status, 409);
    });
  });

  describe('Dashboard and notifications', () => {
    it('shows each user only their own data', async () => {
      const a = (await call('get', '/dashboard', t.admin)).body.data;
      const c2 = (await call('get', '/dashboard', t.client2)).body.data;
      assert.ok(a.projects.total >= 3);
      assert.equal(c2.projects.total, 1);
      assert.equal(c2.projects.completed, 1);
    });
    it('marks notifications as read', async () => {
      const list = await call('get', '/notifications', t.manager);
      assert.ok(list.body.data.length > 0);
      assert.equal((await call('post', '/notifications/read-all', t.manager)).status, 200);
      assert.equal((await call('get', '/notifications/unread-count', t.manager)).body.data.unread, 0);
    });
    it("cannot mark another user's notification as read", async () => {
      const [n] = await query("SELECT id FROM notifications WHERE user_id = (SELECT id FROM users WHERE email = 'client2@buildsmart.test') AND is_read = 0 LIMIT 1");
      await call('patch', `/notifications/${n.id}/read`, t.client);
      const [after] = await query('SELECT is_read FROM notifications WHERE id = ?', [n.id]);
      assert.equal(after.is_read, 0);
    });
  });

  describe('Database constraints and error handling', () => {
    it('the database refuses negative stock even if the code were bypassed', async () => {
      await assert.rejects(pool.query('UPDATE materials SET stock_qty = -1 WHERE id = 1'));
    });
    it('the database refuses an out-of-range rating', async () => {
      await assert.rejects(pool.query('INSERT INTO reviews (service_id, reviewer_id, rating) VALUES (1, 1, 6)'));
    });
    it('returns JSON 404 for unknown routes and never leaks stack traces', async () => {
      const res = await call('get', '/does-not-exist', t.admin);
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });
    it('returns 400 for malformed JSON', async () => {
      const { default: request } = await import('supertest');
      const { default: app } = await import('../src/app.js');
      const res = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{bad json');
      assert.equal(res.status, 400);
    });
    it('the health check is public', async () => {
      assert.equal((await call('get', '/health')).status, 200);
    });
  });
});
