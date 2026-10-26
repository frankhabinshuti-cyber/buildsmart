import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, call, login, closeDb, query, idOf, signExpired, PASSWORD } from './helpers.js';

describe('Authentication', () => {
  before(resetDb);
  after(closeDb);

  const valid = { fullName: 'New Person', email: 'new.person@example.com', password: 'Strong1234', role: 'client' };

  it('registers a new user and returns a token (no password hash)', async () => {
    const res = await call('post', '/auth/register', null, valid);
    assert.equal(res.status, 201);
    assert.ok(res.body.data.token);
    assert.equal(res.body.data.user.role, 'client');
    assert.ok(!JSON.stringify(res.body).includes('password'));
  });

  it('stores a bcrypt hash, never the plain password', async () => {
    const [u] = await query('SELECT password_hash FROM users WHERE email = ?', [valid.email]);
    assert.notEqual(u.password_hash, valid.password);
    assert.match(u.password_hash, /^\$2[aby]\$/);
  });

  it('rejects a duplicate email with 409', async () => {
    assert.equal((await call('post', '/auth/register', null, valid)).status, 409);
  });

  it('rejects weak passwords with field errors (422)', async () => {
    const res = await call('post', '/auth/register', null, { ...valid, email: 'weak@example.com', password: 'abc' });
    assert.equal(res.status, 422);
    assert.ok(res.body.error.details.password);
  });

  it('does not allow self-registration as super_admin (role escalation)', async () => {
    const res = await call('post', '/auth/register', null, { ...valid, email: 'evil@example.com', role: 'super_admin' });
    assert.equal(res.status, 422);
    assert.equal((await query('SELECT id FROM users WHERE email = ?', ['evil@example.com'])).length, 0);
  });

  it('logs in with correct credentials', async () => {
    const res = await call('post', '/auth/login', null, { email: 'client@buildsmart.rw', password: PASSWORD });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.role, 'client');
  });

  it('gives the same generic message for wrong password and unknown email', async () => {
    const a = await call('post', '/auth/login', null, { email: 'client@buildsmart.rw', password: 'Wrong1234' });
    const b = await call('post', '/auth/login', null, { email: 'nobody@example.com', password: 'Wrong1234' });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.body.error.message, b.body.error.message);
  });

  it('is safe against SQL injection in the login form', async () => {
    const res = await call('post', '/auth/login', null, { email: "admin@buildsmart.rw' OR '1'='1", password: 'x' });
    assert.ok([401, 422].includes(res.status));
  });

  it('locks the account after 5 failed attempts, even for the right password', async () => {
    for (let i = 0; i < 5; i++) await call('post', '/auth/login', null, { email: 'client2@buildsmart.rw', password: 'Wrong1234' });
    const res = await call('post', '/auth/login', null, { email: 'client2@buildsmart.rw', password: PASSWORD });
    assert.equal(res.status, 429);
  });

  it('protects routes: no token, bad token and expired token are all 401', async () => {
    assert.equal((await call('get', '/auth/me')).status, 401);
    assert.equal((await call('get', '/auth/me', 'not-a-token')).status, 401);
    const expired = await call('get', '/auth/me', signExpired(await idOf('client@buildsmart.rw')));
    assert.equal(expired.status, 401);
    assert.match(expired.body.error.message, /expired/i);
  });

  it('a deactivated user can no longer use an existing token', async () => {
    const token = await login('worker@buildsmart.rw');
    assert.equal((await call('get', '/auth/me', token)).status, 200);
    await query('UPDATE users SET is_active = 0 WHERE email = ?', ['worker@buildsmart.rw']);
    assert.equal((await call('get', '/auth/me', token)).status, 401);
    const again = await call('post', '/auth/login', null, { email: 'worker@buildsmart.rw', password: PASSWORD });
    assert.equal(again.status, 403);
    await query('UPDATE users SET is_active = 1 WHERE email = ?', ['worker@buildsmart.rw']);
  });

  it('password reset: token works once and the new password logs in', async () => {
    const f = await call('post', '/auth/forgot-password', null, { email: 'supplier@buildsmart.rw' });
    assert.equal(f.status, 200);
    const token = f.body.data.devResetToken;
    assert.ok(token);
    assert.equal((await call('post', '/auth/reset-password', null, { token: 'x'.repeat(40), newPassword: 'Another1234' })).status, 400);
    assert.equal((await call('post', '/auth/reset-password', null, { token, newPassword: 'Another1234' })).status, 200);
    assert.equal((await call('post', '/auth/reset-password', null, { token, newPassword: 'Third12345' })).status, 400);
    assert.equal((await call('post', '/auth/login', null, { email: 'supplier@buildsmart.rw', password: 'Another1234' })).status, 200);
  });

  it('forgot-password does not reveal whether an email exists', async () => {
    const res = await call('post', '/auth/forgot-password', null, { email: 'ghost@example.com' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.devResetToken, undefined);
  });

  it('a user can update their profile and change their password', async () => {
    const token = await login('engineer@buildsmart.rw');
    const up = await call('patch', '/auth/me', token, { fullName: 'Eric Nshuti', phone: '+250788444444', location: 'Huye' });
    assert.equal(up.status, 200);
    assert.equal(up.body.data.location, 'Huye');
    assert.equal((await call('post', '/auth/change-password', token, { currentPassword: 'wrong', newPassword: 'Newpass1234' })).status, 400);
    assert.equal((await call('post', '/auth/change-password', token, { currentPassword: PASSWORD, newPassword: 'Newpass1234' })).status, 200);
  });
});
