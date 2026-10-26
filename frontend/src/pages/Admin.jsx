import { useState } from 'react';
import { api, readError } from '../api/client.js';
import { useFetch, useDebounced } from '../hooks.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { EmptyState, ErrorBox, PageHeader, Pagination, Spinner, Stat } from '../components/ui.jsx';
import { dateTime, number, ROLE_LABELS } from '../utils/format.js';

const ROLE_CODES = ['super_admin', 'company', 'project_manager', 'client', 'engineer_architect', 'worker', 'supplier'];

export function AdminUsers() {
  const { user: me } = useAuth();
  const { toast } = useUi();
  const [q, setQ] = useState(''); const [role, setRole] = useState(''); const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const stats = useFetch('/admin/stats');
  const { data, meta, loading, error, reload } = useFetch('/admin/users', { q: dq || undefined, role: role || undefined, page, limit: 10 });

  const update = async (u, body, okText) => {
    try { await api.patch(`/admin/users/${u.id}`, body); toast(okText); reload(); stats.reload(); }
    catch (x) { toast(readError(x).message, 'error'); reload(); }
  };

  return (
    <>
      <PageHeader title="Users & roles" subtitle="Manage accounts, assign roles and monitor the platform. Every change is written to the audit log." />
      {stats.data && (
        <div className="grid cols-3" style={{ marginBottom: 20 }}>
          <Stat icon="👥" value={number(stats.data.totals.users)} label="Users" />
          <Stat icon="🏗" value={number(stats.data.totals.projects)} label="Active projects" tone="orange" />
          <Stat icon="🧾" value={number(stats.data.totals.openRequests)} label="Open quotation requests" tone="green" />
        </div>
      )}
      <form className="toolbar" role="search" onSubmit={(e) => e.preventDefault()}>
        <input className="input" aria-label="Search users" placeholder="Search name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select className="input" aria-label="Filter by role" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
          <option value="">All roles</option>{ROLE_CODES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
      </form>
      {loading && !data && <Spinner />}{error && <ErrorBox message={error} onRetry={reload} />}
      {data?.length === 0 && <div className="card"><EmptyState icon="👥" title="No users match" /></div>}
      {data?.length > 0 && (
        <div className="card flush"><div className="table-wrap"><table className="table">
          <thead><tr><th>User</th><th>Role</th><th>Last login</th><th>Status</th></tr></thead>
          <tbody>{data.map((u) => {
            const self = u.id === me.id;
            return (
              <tr key={u.id}>
                <td><b>{u.fullName}</b><div className="muted small">{u.email}</div></td>
                <td><select className="input" aria-label={`Role of ${u.fullName}`} value={u.role} disabled={self} onChange={(e) => update(u, { role: e.target.value }, 'Role updated')}>
                  {ROLE_CODES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></td>
                <td>{u.lastLoginAt ? dateTime(u.lastLoginAt) : 'Never'}</td>
                <td><span className="row"><span className={`badge ${Number(u.isActive) ? 'green' : 'red'}`}>{Number(u.isActive) ? 'Active' : 'Deactivated'}</span>
                  {!self && <button className="btn btn-outline btn-sm" onClick={() => update(u, { isActive: !Number(u.isActive) }, Number(u.isActive) ? 'Account deactivated' : 'Account activated')}>{Number(u.isActive) ? 'Deactivate' : 'Activate'}</button>}</span></td>
              </tr>);
          })}</tbody>
        </table></div></div>
      )}
      <Pagination meta={meta} onPage={setPage} />
    </>
  );
}

export function AdminAudit() {
  const [action, setAction] = useState(''); const [page, setPage] = useState(1);
  const da = useDebounced(action);
  const { data, meta, loading, error, reload } = useFetch('/admin/audit-logs', { action: da || undefined, page, limit: 15 });
  return (
    <>
      <PageHeader title="Audit log" subtitle="A record of sensitive actions: logins, role changes, approvals, quotations and more." />
      <div className="toolbar"><input className="input" aria-label="Filter by action" placeholder="Filter by action, e.g. quotation or auth" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} /></div>
      {loading && !data && <Spinner />}{error && <ErrorBox message={error} onRetry={reload} />}
      {data?.length === 0 && <div className="card"><EmptyState icon="🛡" title="No audit entries match" /></div>}
      {data?.length > 0 && (
        <div className="card flush"><div className="table-wrap"><table className="table">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th><th>IP</th></tr></thead>
          <tbody>{data.map((a) => (
            <tr key={a.id}><td>{dateTime(a.createdAt)}</td><td>{a.userName || 'System'}</td><td><code>{a.action}</code></td>
              <td>{a.entity ? `${a.entity} #${a.entityId ?? ''}` : '-'}</td><td className="small">{a.details || '-'}</td><td className="small muted">{a.ip || '-'}</td></tr>))}</tbody>
        </table></div></div>
      )}
      <Pagination meta={meta} onPage={setPage} />
    </>
  );
}
