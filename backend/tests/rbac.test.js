import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, call, loginAll, closeDb, query, dayOffset } from './helpers.js';

describe('Role-based access control (enforced by the backend)', () => {
  let t;
  before(async () => { await resetDb(); t = await loginAll(); });
  after(closeDb);

  const newProject = { title: 'Test Project', estimatedBudget: '1000000', plannedStart: dayOffset(1), plannedEnd: dayOffset(30) };

  it('a client cannot create a project (403) but a company can (201)', async () => {
    assert.equal((await call('post', '/projects', t.client, newProject)).status, 403);
    assert.equal((await call('post', '/projects', t.company, newProject)).status, 201);
  });

  it('a user only sees projects they belong to; others return 404 (not 403)', async () => {
    const mine = await call('get', '/projects', t.client2);
    assert.ok(mine.body.data.length >= 1);
    assert.ok(mine.body.data.every((p) => p.title === 'Kimironko Office Renovation'));
    assert.equal((await call('get', '/projects/1', t.client2)).status, 404);
  });

  it('a worker only sees tasks assigned to them', async () => {
    const res = await call('get', '/tasks', t.worker);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length > 0);
    const [w] = await query("SELECT id FROM users WHERE email = 'worker@buildsmart.rw'");
    assert.ok(res.body.data.every((x) => x.assigneeId === w.id));
  });

  it('a worker can change the status of their task but nothing else', async () => {
    const [task] = await query("SELECT id FROM tasks WHERE title = 'Pour ground floor slab'");
    assert.equal((await call('patch', `/tasks/${task.id}`, t.worker, { status: 'blocked', note: 'Waiting for rebar' })).status, 200);
    assert.equal((await call('patch', `/tasks/${task.id}`, t.worker, { title: 'Hacked title' })).status, 403);
    assert.equal((await call('patch', `/tasks/${task.id}`, t.worker, { assigneeId: 1 })).status, 403);
  });

  it("a worker cannot update someone else's task", async () => {
    const [task] = await query("SELECT id FROM tasks WHERE title = 'Structural drawings review'");
    assert.equal((await call('patch', `/tasks/${task.id}`, t.worker, { status: 'done' })).status, 403);
  });

  it('a client cannot see materials or inventory', async () => {
    assert.equal((await call('get', '/materials', t.client)).status, 403);
    assert.equal((await call('get', '/suppliers', t.client)).status, 403);
  });

  it('a supplier only sees their own catalog', async () => {
    const res = await call('get', '/materials', t.supplier);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 1);
    assert.ok(res.body.data.every((m) => m.supplierName === 'Rwanda Cement Supply'));
  });

  it('admin endpoints are for the super administrator only', async () => {
    for (const r of ['company', 'manager', 'client', 'worker']) {
      assert.equal((await call('get', '/admin/users', t[r])).status, 403, r);
    }
    const res = await call('get', '/admin/users', t.admin);
    assert.equal(res.status, 200);
    assert.ok(!JSON.stringify(res.body).includes('password'));
  });

  it('admin cannot deactivate or demote themselves', async () => {
    const me = await call('get', '/auth/me', t.admin);
    assert.equal((await call('patch', `/admin/users/${me.body.data.id}`, t.admin, { isActive: false })).status, 403);
  });

  it('admin can deactivate another user, and the change is audited', async () => {
    const [u] = await query("SELECT id FROM users WHERE email = 'engineer@buildsmart.rw'");
    assert.equal((await call('patch', `/admin/users/${u.id}`, t.admin, { isActive: false })).status, 200);
    assert.equal((await call('get', '/auth/me', t.engineer)).status, 401);
    const logs = await call('get', '/admin/audit-logs?action=admin.update_user', t.admin);
    assert.ok(logs.body.data.length >= 1);
    await call('patch', `/admin/users/${u.id}`, t.admin, { isActive: true });
  });

  it('expense status cannot be forced by the client request', async () => {
    const r = await call('post', '/projects/1/expenses', t.manager, { category: 'other', description: 'Sneaky approved expense', amount: '100', incurredOn: dayOffset(0), status: 'approved' });
    assert.equal(r.status, 201);
    const [e] = await query('SELECT status FROM expenses WHERE id = ?', [r.body.data.id]);
    assert.equal(e.status, 'pending');
  });

  it('you cannot approve your own expense, but the company owner can approve it', async () => {
    const r = await call('post', '/projects/1/expenses', t.manager, { category: 'labor', description: 'Extra crew', amount: '250000', incurredOn: dayOffset(0) });
    assert.equal((await call('patch', `/expenses/${r.body.data.id}/review`, t.manager, { decision: 'approved' })).status, 403);
    assert.equal((await call('patch', `/expenses/${r.body.data.id}/review`, t.company, { decision: 'approved' })).status, 200);
    assert.equal((await call('patch', `/expenses/${r.body.data.id}/review`, t.company, { decision: 'rejected' })).status, 409);
  });

  it('a client only sees approved expenses', async () => {
    const res = await call('get', '/projects/1/expenses', t.client);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length > 0);
    assert.ok(res.body.data.every((e) => e.status === 'approved'));
  });

  it('only clients may write reviews; one review per service', async () => {
    assert.equal((await call('post', '/marketplace/services/2/reviews', t.worker, { rating: 5 })).status, 403);
    assert.equal((await call('post', '/marketplace/services/2/reviews', t.client, { rating: 5, comment: 'Great' })).status, 201);
    assert.equal((await call('post', '/marketplace/services/2/reviews', t.client, { rating: 4 })).status, 409);
    assert.equal((await call('post', '/marketplace/services/3/reviews', t.client, { rating: 9 })).status, 422);
  });

  it('the public marketplace works without logging in', async () => {
    const res = await call('get', '/marketplace/services?category=1');
    assert.equal(res.status, 200);
    assert.ok(res.body.meta.total >= 1);
  });
});
