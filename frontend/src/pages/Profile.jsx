import { useState } from 'react';
import { api, readError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { Field, PageHeader } from '../components/ui.jsx';
import { validatePassword } from './Register.jsx';
import { ROLE_LABELS } from '../utils/format.js';

export default function Profile() {
  const { user, setUser } = useAuth();
  const { toast } = useUi();
  const [f, setF] = useState({ fullName: user.fullName, phone: user.phone || '', location: user.location || '' });
  const [fields, setFields] = useState({});
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwErr, setPwErr] = useState({});

  const save = async (e) => {
    e.preventDefault(); setFields({});
    try { await api.patch('/auth/me', f); const me = await api.get('/auth/me'); setUser(me.data.data); toast('Profile saved'); }
    catch (x) { const r = readError(x); setFields(r.fields); toast(r.message, 'error'); }
  };
  const change = async (e) => {
    e.preventDefault(); setPwErr({});
    const problem = validatePassword(pw.newPassword);
    if (!pw.currentPassword || problem) { setPwErr({ currentPassword: pw.currentPassword ? '' : 'Enter your current password', newPassword: problem }); return; }
    try { await api.post('/auth/change-password', pw); setPw({ currentPassword: '', newPassword: '' }); toast('Password changed'); }
    catch (x) { const r = readError(x); setPwErr(r.fields.currentPassword || r.fields.newPassword ? r.fields : { currentPassword: r.message }); }
  };

  return (
    <>
      <PageHeader title="My profile" subtitle={`${ROLE_LABELS[user.role]} · ${user.email}`} />
      <div className="grid cols-2">
        <section className="card">
          <h2 style={{ fontSize: '1.1rem' }}>Personal details</h2>
          <form onSubmit={save} noValidate>
            <Field label="Full name" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} error={fields.fullName} required />
            <Field label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} error={fields.phone} />
            <Field label="Location" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} error={fields.location} />
            <button className="btn btn-primary">Save changes</button>
          </form>
        </section>
        <section className="card">
          <h2 style={{ fontSize: '1.1rem' }}>Change password</h2>
          <form onSubmit={change} noValidate>
            <Field type="password" autoComplete="current-password" label="Current password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} error={pwErr.currentPassword} />
            <Field type="password" autoComplete="new-password" label="New password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} error={pwErr.newPassword} hint="At least 8 characters with upper case, lower case and a number" />
            <button className="btn btn-navy">Update password</button>
          </form>
        </section>
      </div>
    </>
  );
}
