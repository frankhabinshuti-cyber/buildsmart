import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { readError } from '../api/client.js';
import { Field } from '../components/ui.jsx';

// Demo accounts created by `npm run db:seed` (development only). Admin has its own password.
const DEMO_PASSWORD = 'Demo@12345';
const DEMO = [
  ['Admin', 'admin@buildsmart.rw', 'Admin@12345'], ['Company', 'company@buildsmart.rw'], ['Manager', 'manager@buildsmart.rw'],
  ['Client', 'client@buildsmart.rw'], ['Engineer', 'engineer@buildsmart.rw'], ['Worker', 'worker@buildsmart.rw'], ['Supplier', 'supplier@buildsmart.rw'],
];

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setFields({});
    if (!email.trim() || !password) { setFields({ email: email.trim() ? '' : 'Enter your email', password: password ? '' : 'Enter your password' }); return; }
    setBusy(true);
    try { await login(email, password); nav(loc.state?.from?.startsWith('/app') ? loc.state.from : '/app', { replace: true }); }
    catch (x) { const r = readError(x); setError(r.message); setFields(r.fields); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card card">
        <h1 style={{ fontSize: '1.6rem' }}>Welcome back</h1>
        <p className="muted">Log in to your BuildSmart workspace.</p>
        {error && <div className="alert error" role="alert">{error}</div>}
        <form onSubmit={submit} noValidate>
          <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fields.email} required />
          <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fields.password} required />
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Logging in...' : 'Log in'}</button>
        </form>
        <p className="small" style={{ marginTop: 14 }}><Link className="link" to="/forgot-password">Forgot your password?</Link></p>
        <p className="small muted">New to BuildSmart? <Link className="link" to="/register">Create an account</Link></p>
        {import.meta.env.DEV && (
          <div className="alert info" style={{ marginTop: 14, marginBottom: 0 }}>
            <b>Demo accounts</b> (development only) - click one to fill the form
            <div className="row" style={{ marginTop: 8, gap: 6 }}>
              {DEMO.map(([n, em, pw]) => <button key={em} type="button" className="btn btn-sm btn-outline" onClick={() => { setEmail(em); setPassword(pw || DEMO_PASSWORD); }}>{n}</button>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
