import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { readError } from '../api/client.js';
import { Field } from '../components/ui.jsx';

const ROLES = [
  ['client', 'Client', 'I want to build or renovate and request quotations.'],
  ['company', 'Construction company', 'I run a company and manage projects and teams.'],
  ['project_manager', 'Project manager', 'I manage tasks, budgets and schedules.'],
  ['engineer', 'Engineer / Architect', 'I deliver design and engineering work.'],
  ['worker', 'Worker / Contractor', 'I take on tasks and trade jobs.'],
  ['supplier', 'Supplier', 'I supply construction materials.'],
];

export function validatePassword(p) {
  if (p.length < 8) return 'At least 8 characters';
  if (!/[a-z]/.test(p)) return 'Add a lowercase letter';
  if (!/[A-Z]/.test(p)) return 'Add an uppercase letter';
  if (!/\d/.test(p)) return 'Add a number';
  return '';
}

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ fullName: '', email: '', password: '', role: 'client', phone: '', location: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (f.fullName.trim().length < 2) errs.fullName = 'Enter your full name';
    if (!/^\S+@\S+\.\S+$/.test(f.email)) errs.email = 'Enter a valid email address';
    const pe = validatePassword(f.password); if (pe) errs.password = pe;
    setErrors(errs); setError('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try { await register(f); nav('/app', { replace: true }); }
    catch (x) { const r = readError(x); setError(r.message); setErrors(r.fields); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card card" style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: '1.6rem' }}>Create your account</h1>
        <p className="muted">Choose how you will use BuildSmart. You can ask an administrator to change this later.</p>
        {error && <div className="alert error" role="alert">{error}</div>}
        <form onSubmit={submit} noValidate>
          <fieldset style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
            <legend style={{ fontWeight: 700, fontSize: '.85rem', marginBottom: 8 }}>I am a...</legend>
            <div className="role-picker">
              {ROLES.map(([v, t, d]) => (
                <label key={v}><input type="radio" name="role" value={v} checked={f.role === v} onChange={set('role')} /><span><b>{t}</b><br /><span className="muted small">{d}</span></span></label>
              ))}
            </div>
            {errors.role && <span className="field-error" role="alert">{errors.role}</span>}
          </fieldset>
          <div className="form-grid">
            <Field label="Full name" autoComplete="name" value={f.fullName} onChange={set('fullName')} error={errors.fullName} required />
            <Field label="Email" type="email" autoComplete="email" value={f.email} onChange={set('email')} error={errors.email} required />
            <Field label="Password" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} error={errors.password} hint="8+ characters with upper case, lower case and a number" required />
            <Field label="Phone (optional)" type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} error={errors.phone} />
          </div>
          <Field label="Location (optional)" placeholder="e.g. Kigali" value={f.location} onChange={set('location')} error={errors.location} />
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Creating account...' : 'Create account'}</button>
        </form>
        <p className="small muted" style={{ marginTop: 14 }}>Already registered? <Link className="link" to="/login">Log in</Link></p>
      </div>
    </div>
  );
}
