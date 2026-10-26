import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, readError } from '../api/client.js';
import { useFetch, useDebounced } from '../hooks.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { EmptyState, ErrorBox, Field, Modal, PageHeader, Pagination, Progress, Spinner, StatusBadge } from '../components/ui.jsx';
import UserSelect from '../components/UserSelect.jsx';
import { date, money } from '../utils/format.js';

const STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];
const EMPTY = { title: '', description: '', location: '', categoryId: '', clientId: '', managerId: '', plannedStart: '', plannedEnd: '', estimatedBudget: '', approvedBudget: '' };

export function NewProjectModal({ onClose, onCreated }) {
  const { user } = useAuth();
  const { toast } = useUi();
  const cats = useFetch('/marketplace/categories');
  const [f, setF] = useState(EMPTY);
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target ? e.target.value : e }));

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(''); setFields({});
    const body = { ...f, estimatedBudget: f.estimatedBudget || '0', approvedBudget: f.approvedBudget || undefined };
    Object.keys(body).forEach((k) => { if (body[k] === '') body[k] = null; });
    try { const r = await api.post('/projects', body); toast('Project created'); onCreated(r.data.data.id); }
    catch (x) { const r = readError(x); setError(r.message); setFields(r.fields); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="New project" onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        {error && <div className="alert error" role="alert">{error}</div>}
        <Field label="Project title" value={f.title} onChange={set('title')} error={fields.title} required />
        <Field as="textarea" rows={3} label="Description" value={f.description} onChange={set('description')} error={fields.description} />
        <div className="form-grid">
          <Field label="Location" value={f.location} onChange={set('location')} error={fields.location} />
          <Field as="select" label="Category" value={f.categoryId} onChange={set('categoryId')} error={fields.categoryId}>
            <option value="">Choose...</option>
            {(cats.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Field>
          <UserSelect role="client" label="Client" value={f.clientId} onChange={set('clientId')} error={fields.clientId} emptyLabel="No client yet" />
          {user.role !== 'project_manager' && <UserSelect role="project_manager" label="Project manager" value={f.managerId} onChange={set('managerId')} error={fields.managerId} />}
          <Field type="date" label="Planned start" value={f.plannedStart} onChange={set('plannedStart')} error={fields.plannedStart} />
          <Field type="date" label="Planned completion" value={f.plannedEnd} onChange={set('plannedEnd')} error={fields.plannedEnd} />
          <Field type="number" min="0" step="0.01" label="Estimated budget (RWF)" value={f.estimatedBudget} onChange={set('estimatedBudget')} error={fields.estimatedBudget} />
          <Field type="number" min="0" step="0.01" label="Approved budget (RWF)" value={f.approvedBudget} onChange={set('approvedBudget')} error={fields.approvedBudget} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Create project'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Projects() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('created_at');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const dq = useDebounced(q);
  const { data, meta, loading, error, reload } = useFetch('/projects', { q: dq || undefined, status: status || undefined, sort, order: sort === 'title' ? 'asc' : 'desc', archived: String(archived), page, limit: 8 });
  const canCreate = ['super_admin', 'company', 'project_manager'].includes(user.role);
  const reset = (fn) => (e) => { fn(e.target.type === 'checkbox' ? e.target.checked : e.target.value); setPage(1); };

  return (
    <>
      <PageHeader title="Projects" subtitle="Plan, track and manage every construction project.">
        {canCreate && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New project</button>}
      </PageHeader>
      <form className="toolbar" role="search" onSubmit={(e) => e.preventDefault()}>
        <input className="input" aria-label="Search projects" placeholder="Search by title or location" value={q} onChange={reset(setQ)} />
        <select className="input" aria-label="Status" value={status} onChange={reset(setStatus)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select className="input" aria-label="Sort by" value={sort} onChange={reset(setSort)}>
          <option value="created_at">Newest first</option><option value="title">Title A-Z</option>
          <option value="planned_end">Completion date</option><option value="completion_pct">Progress</option>
        </select>
        <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={archived} onChange={reset(setArchived)} /> Show archived</label>
      </form>

      {loading && <Spinner />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!loading && !error && data?.length === 0 && (
        <div className="card"><EmptyState icon="🏗" title="No projects found" action={canCreate && !archived ? <button className="btn btn-primary" onClick={() => setCreating(true)}>Create your first project</button> : null}>
          {canCreate ? 'Try different filters, or create a new project.' : 'You will see projects here once you are added to one.'}</EmptyState></div>
      )}
      {!loading && data?.length > 0 && (
        <div className="card flush">
          <div className="table-wrap">
            <table className="table">
              <caption className="skip-link" style={{ position: 'absolute' }}>Projects</caption>
              <thead><tr><th>Project</th><th>Status</th><th>Progress</th><th>Budget</th><th>Spent</th><th>Ends</th></tr></thead>
              <tbody>
                {data.map((p) => {
                  const budget = Number(p.approvedBudget) > 0 ? p.approvedBudget : p.estimatedBudget;
                  const over = Number(budget) > 0 && Number(p.spent) > Number(budget);
                  return (
                    <tr key={p.id}>
                      <td><Link className="link" to={`/app/projects/${p.id}`}><b>{p.title}</b></Link><div className="muted small">{p.location || '-'}{p.clientName ? ` · ${p.clientName}` : ''}</div></td>
                      <td><StatusBadge status={p.status} /></td>
                      <td style={{ minWidth: 130 }}><Progress value={p.completionPct} /><span className="small muted">{p.completionPct}%</span></td>
                      <td className="num">{money(budget)}</td>
                      <td className="num" style={over ? { color: 'var(--red)', fontWeight: 700 } : undefined}>{money(p.spent)}</td>
                      <td>{date(p.plannedEnd)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Pagination meta={meta} onPage={setPage} />
      {creating && <NewProjectModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); nav(`/app/projects/${id}`); }} />}
    </>
  );
}
