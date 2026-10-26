import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, readError } from '../api/client.js';
import { Field } from '../components/ui.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { const r = await api.post('/auth/forgot-password', { email }); setDone(r.data.data); }
    catch (x) { setError(readError(x).message); } finally { setBusy(false); }
  };
  return (
    <div className="auth-wrap">
      <div className="auth-card card">
        <h1 style={{ fontSize: '1.6rem' }}>Reset your password</h1>
        {done ? (
          <>
            <div className="alert success" role="status">{done.message}</div>
            {done.devResetToken && (
              <div className="alert info">Development mode: email sending is not set up yet, so use this link directly:<br />
                <Link className="link" to={`/reset-password?token=${done.devResetToken}`}>Open the reset page</Link></div>
            )}
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="muted">Enter your email and we will send you a reset link.</p>
            {error && <div className="alert error" role="alert">{error}</div>}
            <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Sending...' : 'Send reset link'}</button>
          </form>
        )}
        <p className="small" style={{ marginTop: 14 }}><Link className="link" to="/login">Back to log in</Link></p>
      </div>
    </div>
  );
}
