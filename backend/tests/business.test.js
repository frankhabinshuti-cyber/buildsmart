import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, call, loginAll, closeDb, query, dayOffset } from './helpers.js';
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
  let t;
  before(async () => { await resetDb(); t = await loginAll(); });
  after(closeDb);
  const idByTitle = async (title) => (await query('SELECT id FROM tasks WHERE title = ?', [title]))[0].id;

  describe('Projects', () => {
    it('rejects an end date before the start date (422)', async () => {
      const res = await call('post', '/projects', t.company, { title: 'Bad dates', plannedStart: '2026-12-10', plannedEnd: '2026-12-01' });
      assert.equal(res.status, 422);
      assert.ok(res.body.error.details.plannedEnd);
    });
    it('supports search, status filter, sorting and pagination', async () => {
      const all = await call('get', '/projects?limit=2&page=1&sort=title&order=asc', t.admin);
      assert.equal(all.body.data.length, 2);
      assert.equal(all.body.meta.total, 5);
      assert.equal(all.body.meta.pages, 3);
      assert.ok(all.body.data[0].title <= all.body.data[1].title);
      assert.equal((await call('get', '/projects?status=completed', t.admin)).body.data.length, 1);
      assert.equal((await call('get', '/projects?q=remera', t.admin)).body.data[0].title, 'Remera Office Block');
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
      assert.equal((await call('get', '/projects?q=archive', t.company)).body.data.length, 0);
      assert.equal((await call('get', '/projects?archived=true', t.company)).body.data.length, 1);
      assert.equal((await call('post', `/projects/${c.body.data.id}/restore`, t.company)).status, 200);
    });
    it('budget summary is calculated on the server from approved expenses only', async () => {
      const b = (await call('get', '/projects/1', t.manager)).body.data.budget;
      // approved: 3,200,000 + 4,800,000 + 900,000 = 8,900,000. The 650,000 transport expense is still pending.
      assert.equal(b.budget, '40000000.00');
      assert.equal(b.spent, '8900000.00');
      assert.equal(b.pending, '650000.00');
      assert.equal(b.remaining, '31100000.00');
      assert.equal(b.overBudget, false);
    });
    it('progress updates change completion, move the status and are kept as history', async () => {
      const r = await call('post', '/projects/1/progress', t.manager, { completionPct: 55, note: 'Beams started' });
      assert.equal(r.status, 201);
      const p = (await call('get', '/projects/1', t.manager)).body.data;
      assert.equal(p.completionPct, 55);
      assert.equal(p.progress[0].note, 'Beams started');
      assert.equal((await call('post', '/projects/1/progress', t.manager, { completionPct: 120 })).status, 422);
      assert.equal((await call('post', '/projects/1/progress', t.client, { completionPct: 90 })).status, 403);
    });
    it('milestones can be added, completed and removed by the manager', async () => {
      const m = await call('post', '/projects/1/milestones', t.manager, { title: 'Roof sheets', dueDate: dayOffset(60) });
      assert.equal(m.status, 201);
      const id = m.body.data.id;
      assert.equal((await call('put', `/projects/1/milestones/${id}`, t.manager, { title: 'Roof sheets', status: 'done' })).status, 200);
      const p = (await call('get', '/projects/1', t.manager)).body.data;
      assert.equal(p.milestones.find((x) => x.id === id).status, 'done');
      assert.equal((await call('delete', `/projects/1/milestones/${id}`, t.manager)).status, 200);
    });
    it('project members can post messages and others are notified', async () => {
      const before = (await call('get', '/notifications/unread-count', t.client)).body.data.unread;
      assert.equal((await call('post', '/projects/1/messages', t.manager, { body: 'Slab pour on Friday.' })).status, 201);
      assert.equal((await call('get', '/notifications/unread-count', t.client)).body.data.unread, before + 1);
      assert.equal((await call('post', '/projects/1/messages', t.client2, { body: 'hi' })).status, 404);
    });
  });

  describe('Tasks', () => {
    it('blocks starting a task before its dependency is done', async () => {
      const first = await call('post', '/tasks', t.manager, { projectId: 1, title: 'Fix formwork' });
      const second = await call('post', '/tasks', t.manager, { projectId: 1, title: 'Pour beams', assigneeId: (await query("SELECT id FROM users WHERE email='worker@buildsmart.rw'"))[0].id, dependsOnTaskId: first.body.data.id });
      assert.equal(second.status, 201);
      const res = await call('patch', `/tasks/${second.body.data.id}`, t.worker, { status: 'in_progress' });
      assert.equal(res.status, 409);
      assert.match(res.body.error.message, /Fix formwork/);
      await call('patch', `/tasks/${first.body.data.id}`, t.manager, { status: 'done' });
      assert.equal((await call('patch', `/tasks/${second.body.data.id}`, t.worker, { status: 'in_progress' })).status, 200);
    });
    it('flags overdue tasks and never flags finished ones', async () => {
      const res = await call('get', '/tasks?projectId=2', t.manager);
      const overdue = res.body.data.filter((x) => x.isOverdue);
      assert.ok(overdue.some((x) => x.title === 'Electrical rewiring'));
      const done = await call('get', '/tasks?projectId=1&status=done', t.manager);
      assert.ok(done.body.data.length >= 1 && done.body.data.every((x) => !x.isOverdue));
    });
    it('records history and notifies the assignee when a task is created', async () => {
      const [w] = await query("SELECT id FROM users WHERE email = 'worker@buildsmart.rw'");
      const before = (await call('get', '/notifications/unread-count', t.worker)).body.data.unread;
      const c = await call('post', '/tasks', t.manager, { projectId: 1, title: 'Fix scaffolding', priority: 'high', assigneeId: w.id, dueDate: dayOffset(2) });
      assert.equal(c.status, 201);
      assert.equal((await call('get', '/notifications/unread-count', t.worker)).body.data.unread, before + 1);
      await call('patch', `/tasks/${c.body.data.id}`, t.worker, { status: 'in_progress' });
      assert.equal((await call('get', `/tasks/${c.body.data.id}/history`, t.manager)).body.data.length, 2);
    });
    it('validates required fields', async () => {
      assert.equal((await call('post', '/tasks', t.manager, { projectId: 1, title: '' })).status, 422);
    });
    it('returns 404 for a project that does not exist or is not visible', async () => {
      assert.equal((await call('post', '/tasks', t.manager, { projectId: 999, title: 'Ghost project task' })).status, 404);
      assert.equal((await call('post', '/tasks', t.client2, { projectId: 1, title: 'Not mine' })).status, 404);
    });
  });

  describe('Inventory', () => {
    const stock = async (id) => (await query('SELECT stock_qty FROM materials WHERE id = ?', [id]))[0].stock_qty;
    it('receipts add stock and write a movement with the balance', async () => {
      assert.equal(await stock(3), '40.000');
      const r = await call('post', '/materials/3/movements', t.manager, { type: 'receipt', quantity: '10.5', unitCost: '23000' });
      assert.equal(r.status, 201);
      assert.equal(r.body.data.balance, '50.500');
    });
    it('allocation removes stock and creates an approved material expense', async () => {
      const r = await call('post', '/materials/3/movements', t.manager, { type: 'allocation', quantity: '10', projectId: 1 });
      assert.equal(r.status, 201);
      assert.equal(await stock(3), '40.500');
      const [e] = await query('SELECT amount, status FROM expenses WHERE inventory_movement_id = ?', [r.body.data.id]);
      assert.equal(e.status, 'approved');
      assert.equal(e.amount, '230000.00'); // 10 x 23,000 (cost updated by the receipt)
    });
    it('refuses to allocate more than is in stock (409) and leaves stock unchanged', async () => {
      const before = await stock(1);
      assert.equal((await call('post', '/materials/1/movements', t.manager, { type: 'allocation', quantity: '9999', projectId: 1 })).status, 409);
      assert.equal(await stock(1), before);
    });
    it('two simultaneous allocations cannot oversell the same stock', async () => {
      const start = Number(await stock(4));
      const each = (start * 0.6).toFixed(3);
      const results = await Promise.all([1, 2].map(() => call('post', '/materials/4/movements', t.manager, { type: 'allocation', quantity: each, projectId: 1 })));
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      assert.ok(Number(await stock(4)) >= 0);
    });
    it('lists low-stock items and keeps a movement history', async () => {
      const low = await call('get', '/materials?lowStock=true', t.manager);
      assert.ok(low.body.data.some((m) => m.name === 'Rebar 12mm'));
      const mv = await call('get', '/materials/3/movements', t.manager);
      assert.ok(mv.body.data.length >= 2);
      assert.ok(['receipt', 'allocation', 'adjustment'].includes(mv.body.data[0].type));
    });
    it('rejects invalid quantities (422)', async () => {
      assert.equal((await call('post', '/materials/3/movements', t.manager, { type: 'receipt', quantity: 'abc' })).status, 422);
      assert.equal((await call('post', '/materials/3/movements', t.manager, { type: 'receipt', quantity: '-4' })).status, 400);
    });
  });

  describe('Quotations', () => {
    let requestId;
    const items = [{ kind: 'material', description: 'Blocks', quantity: '60', unitPrice: '28000' }, { kind: 'labor', description: 'Masons', quantity: '1.5', unitPrice: '19.99' }];
    it('only clients create requests; providers cannot', async () => {
      assert.equal((await call('post', '/quotation-requests', t.company, { title: 'Nope request' })).status, 403);
      const r = await call('post', '/quotation-requests', t.client, { title: 'Garden wall', description: '30 m wall', location: 'Kigali', budgetHint: '3000000' });
      assert.equal(r.status, 201);
      requestId = r.body.data.id;
    });
    it('the server calculates totals and ignores a total sent by the browser', async () => {
      const r = await call('post', `/quotation-requests/${requestId}/quotations`, t.company, { validUntil: dayOffset(10), items, total: '1' });
      assert.equal(r.status, 201);
      assert.equal(r.body.data.total, '1680029.99');
    });
    it('re-submitting creates version 2 and keeps version 1 as history', async () => {
      const r = await call('post', `/quotation-requests/${requestId}/quotations`, t.company, { validUntil: dayOffset(10), items: [items[0]] });
      assert.equal(r.body.data.version, 2);
      const detail = await call('get', `/quotation-requests/${requestId}`, t.client);
      const mine = detail.body.data.quotations.filter((q) => q.providerName);
      assert.deepEqual(mine.map((q) => q.status).sort(), ['submitted', 'superseded']);
    });
    it('rejects an expiry date in the past and empty item lists (422)', async () => {
      assert.equal((await call('post', `/quotation-requests/${requestId}/quotations`, t.company, { validUntil: '2020-01-01', items })).status, 422);
      assert.equal((await call('post', `/quotation-requests/${requestId}/quotations`, t.company, { validUntil: dayOffset(5), items: [] })).status, 422);
    });
    it("a provider cannot see a competitor's quotation", async () => {
      await call('post', `/quotation-requests/${requestId}/quotations`, t.engineer, { validUntil: dayOffset(10), items: [items[1]] });
      const view = await call('get', `/quotation-requests/${requestId}`, t.engineer);
      assert.ok(view.body.data.quotations.every((q) => q.providerName === 'Eric Nshuti'));
    });
    it('only the owning client can accept; accepting awards the job and rejects the rest', async () => {
      const detail = await call('get', `/quotation-requests/${requestId}`, t.client);
      const best = detail.body.data.quotations.find((q) => q.status === 'submitted' && q.total === '1680000.00');
      assert.equal((await call('post', `/quotations/${best.id}/accept`, t.client2)).status, 403);
      assert.equal((await call('post', `/quotations/${best.id}/accept`, t.client)).status, 200);
      assert.equal((await call('post', `/quotations/${best.id}/accept`, t.client)).status, 409);
      const after = await call('get', `/quotation-requests/${requestId}`, t.client);
      assert.equal(after.body.data.status, 'awarded');
      assert.ok(after.body.data.quotations.filter((q) => q.status === 'rejected').length >= 1);
    });
  });
});
