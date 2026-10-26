import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, readError } from '../api/client.js';
import { Field } from '../components/ui.jsx';
import { validatePassword } from './Register.jsx';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setError('');
    const pe = validatePassword(password); setFieldError(pe); if (pe) return;
    setBusy(true);
    try { await api.post('/auth/reset-password', { token: params.get('token') || '', newPassword: password }); setOk(true); }
    catch (x) { setError(readError(x).message); } finally { setBusy(false); }
  };
  return (
    <div className="auth-wrap">
      <div className="auth-card card">
        <h1 style={{ fontSize: '1.6rem' }}>Choose a new password</h1>
        {ok ? <div className="alert success" role="status">Your password was changed. <Link className="link" to="/login">Log in</Link></div> : (
          <form onSubmit={submit} noValidate>
            {error && <div className="alert error" role="alert">{error}</div>}
            <Field label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fieldError} hint="8+ characters with upper case, lower case and a number" required />
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Saving...' : 'Change password'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
