import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, readError } from '../api/client.js';
import { useFetch } from '../hooks.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { EmptyState, ErrorBox, Field, Modal, PageHeader, Progress, Spinner, Stat, StatusBadge } from '../components/ui.jsx';
import UserSelect from '../components/UserSelect.jsx';
import { date, dateTime, label, money, ROLE_LABELS, today } from '../utils/format.js';

const TABS = [['overview', 'Overview'], ['tasks', 'Tasks'], ['team', 'Team'], ['budget', 'Budget & expenses'], ['messages', 'Messages']];

/** Runs an API call, shows a toast, and refreshes. Errors are shown in plain words. */
function useAction(reload) {
  const { toast } = useUi();
  return async (fn, okText) => {
    try { await fn(); if (okText) toast(okText); reload?.(); return true; }
    catch (x) { toast(readError(x).message, 'error'); return false; }
  };
}

export default function ProjectDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const { data: p, loading, error, reload } = useFetch(`/projects/${id}`);
  const act = useAction(reload);

  if (loading && !p) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  const budget = p.budget;
  const spentPct = Number(budget.budget) > 0 ? Math.round((Number(budget.spent) / Number(budget.budget)) * 100) : 0;

  return (
    <>
      <PageHeader title={p.title} subtitle={`${p.location || 'No location'}${p.category ? ` · ${p.category}` : ''}`} crumbs={[{ label: 'Projects', to: '/app/projects' }, { label: p.title }]}>
        <StatusBadge status={p.status} />
        {p.archivedAt && <span className="badge">Archived</span>}
        {p.canManage && <button className="btn btn-outline btn-sm" onClick={() => setEditing(true)}>Edit</button>}
        {p.canManage && !p.archivedAt && <button className="btn btn-outline btn-sm" onClick={async () => { if (window.confirm('Archive this project? You can restore it later.') && await act(() => api.delete(`/projects/${id}`), 'Project archived')) nav('/app/projects'); }}>Archive</button>}
        {p.canManage && p.archivedAt && <button className="btn btn-outline btn-sm" onClick={() => act(() => api.post(`/projects/${id}/restore`), 'Project restored')}>Restore</button>}
      </PageHeader>

      <div className="grid cols-3" style={{ marginBottom: 20 }}>
        <Stat icon="📈" value={`${p.completionPct}%`} label="Completion" tone="orange" />
        <Stat icon="💰" value={money(budget.budget)} label="Approved budget" />
        <Stat icon="🧮" value={money(budget.spent)} label={`Spent (${spentPct}%)`} tone={budget.overBudget ? 'red' : 'green'} />
      </div>

      <div className="tabs" role="tablist" aria-label="Project sections">
        {TABS.map(([k, t]) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t}</button>)}
      </div>

      {tab === 'overview' && <Overview p={p} user={user} act={act} id={id} />}
      {tab === 'tasks' && <ProjectTasks p={p} id={id} />}
      {tab === 'team' && <Team p={p} id={id} act={act} />}
      {tab === 'budget' && <Budget p={p} id={id} user={user} reloadProject={reload} />}
      {tab === 'messages' && <Messages id={id} user={user} />}
      {editing && <EditProject p={p} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
    </>
  );
}

function Overview({ p, user, act, id }) {
  const [pct, setPct] = useState(p.completionPct);
  const [note, setNote] = useState('');
  const [ms, setMs] = useState({ title: '', dueDate: '' });
  const canProgress = p.canManage || user.role === 'engineer_architect';
  return (
    <div className="grid cols-2">
      <section className="card">
        <h2 style={{ fontSize: '1.1rem' }}>Details</h2>
        {p.description && <p>{p.description}</p>}
        <dl className="kpi-bar" style={{ margin: 0 }}>
          <div><span className="muted small">Client</span><b>{p.clientName || '-'}</b></div>
          <div><span className="muted small">Manager</span><b>{p.managerName || '-'}</b></div>
          <div><span className="muted small">Start</span><b>{date(p.plannedStart)}</b></div>
          <div><span className="muted small">Planned end</span><b>{date(p.plannedEnd)}</b></div>
          <div><span className="muted small">Estimated</span><b>{money(p.estimatedBudget)}</b></div>
        </dl>
        <Progress value={p.completionPct} />
        {canProgress && (
          <form style={{ marginTop: 16 }} onSubmit={async (e) => { e.preventDefault(); if (await act(() => api.post(`/projects/${id}/progress`, { completionPct: Number(pct), note: note || null }), 'Progress recorded')) setNote(''); }}>
            <h3 style={{ fontSize: '1rem' }}>Report progress</h3>
            <div className="form-grid">
              <Field type="number" min="0" max="100" label="Completion %" value={pct} onChange={(e) => setPct(e.target.value)} required />
              <Field label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-sm">Save progress</button>
          </form>
        )}
      </section>

      <section className="card">
        <h2 style={{ fontSize: '1.1rem' }}>Milestones</h2>
        {p.milestones.length === 0 ? <p className="muted">No milestones yet.</p> : (
          <ul className="list">
            {p.milestones.map((m) => (
              <li key={m.id}>
                <label className="row" style={{ gap: 8 }}>
                  <input type="checkbox" checked={m.status === 'done'} disabled={!p.canManage} aria-label={`Mark "${m.title}" done`}
                    onChange={(e) => act(() => api.put(`/projects/${id}/milestones/${m.id}`, { title: m.title, dueDate: m.dueDate, status: e.target.checked ? 'done' : 'pending' }))} />
                  <span style={m.status === 'done' ? { textDecoration: 'line-through', opacity: 0.7 } : undefined}>{m.title}</span>
                </label>
                <span className="row"><span className="muted small">{date(m.dueDate)}</span>
                  {p.canManage && <button className="btn btn-ghost btn-sm" aria-label={`Delete milestone ${m.title}`} onClick={() => act(() => api.delete(`/projects/${id}/milestones/${m.id}`), 'Milestone removed')}>✕</button>}</span>
              </li>
            ))}
          </ul>
        )}
        {p.canManage && (
          <form className="row" style={{ marginTop: 10, alignItems: 'flex-end' }} onSubmit={async (e) => { e.preventDefault(); if (await act(() => api.post(`/projects/${id}/milestones`, { title: ms.title, dueDate: ms.dueDate || null }), 'Milestone added')) setMs({ title: '', dueDate: '' }); }}>
            <div style={{ flex: 1, minWidth: 160 }}><Field label="New milestone" value={ms.title} onChange={(e) => setMs({ ...ms, title: e.target.value })} required /></div>
            <Field type="date" label="Due" value={ms.dueDate} onChange={(e) => setMs({ ...ms, dueDate: e.target.value })} />
            <button className="btn btn-outline btn-sm" style={{ marginBottom: 16 }}>Add</button>
          </form>
        )}
      </section>

      <section className="card" style={{ gridColumn: '1 / -1' }}>
        <h2 style={{ fontSize: '1.1rem' }}>Progress history</h2>
        {p.progress.length === 0 ? <p className="muted">No progress reports yet.</p> : (
          <ul className="list">{p.progress.map((u) => <li key={u.id}><span><b>{u.completionPct}%</b> - {u.note || 'No note'}<div className="muted small">{u.userName}</div></span><span className="muted small">{dateTime(u.createdAt)}</span></li>)}</ul>
        )}
      </section>
    </div>
  );
}

function ProjectTasks({ p, id }) {
  const { data, loading, error, reload } = useFetch('/tasks', { projectId: id, limit: 50 });
  const act = useAction(reload);
  const [adding, setAdding] = useState(false);
  const { user } = useAuth();
  return (
    <section className="card">
      <div className="row between"><h2 style={{ fontSize: '1.1rem', margin: 0 }}>Tasks</h2>{p.canManage && <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add task</button>}</div>
      {loading && <Spinner />}{error && <ErrorBox message={error} onRetry={reload} />}
      {data?.length === 0 && <EmptyState icon="✔" title="No tasks yet">{p.canManage ? 'Add the first task for this project.' : 'Tasks assigned to you will appear here.'}</EmptyState>}
      {data?.length > 0 && (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Task</th><th>Assignee</th><th>Priority</th><th>Due</th><th>Status</th></tr></thead>
          <tbody>{data.map((t) => (
            <tr key={t.id}>
              <td><b>{t.title}</b>{t.dependsOnTaskId ? <div className="muted small">Depends on task #{t.dependsOnTaskId}</div> : null}</td>
              <td>{t.assigneeName || '-'}</td>
              <td><StatusBadge status={t.priority} /></td>
              <td>{date(t.dueDate)} {t.isOverdue ? <span className="badge red">Overdue</span> : null}</td>
              <td>{(p.canManage || t.assigneeId === user.id)
                ? <select className="input" aria-label={`Status of ${t.title}`} value={t.status} onChange={(e) => act(() => api.patch(`/tasks/${t.id}`, { status: e.target.value }), 'Task updated')}>
                  {['todo', 'in_progress', 'blocked', 'done'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
                : <StatusBadge status={t.status} />}</td>
            </tr>))}</tbody>
        </table></div>
      )}
      {adding && <TaskModal projectId={Number(id)} tasks={data || []} members={p.members} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </section>
  );
}

export function TaskModal({ projectId, tasks, members, onClose, onSaved }) {
  const { toast } = useUi();
  const [f, setF] = useState({ title: '', description: '', priority: 'medium', assigneeId: '', startDate: '', dueDate: '', dependsOnTaskId: '' });
  const [fields, setFields] = useState({}); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(''); setFields({});
    const body = { projectId, ...f };
    Object.keys(body).forEach((k) => { if (body[k] === '') body[k] = null; });
    try { await api.post('/tasks', body); toast('Task created'); onSaved(); }
    catch (x) { const r = readError(x); setError(r.message); setFields(r.fields); } finally { setBusy(false); }
  };
  return (
    <Modal title="New task" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        {error && <div className="alert error" role="alert">{error}</div>}
        <Field label="Title" value={f.title} onChange={set('title')} error={fields.title} required />
        <Field as="textarea" rows={2} label="Description" value={f.description} onChange={set('description')} error={fields.description} />
        <div className="form-grid">
          <Field as="select" label="Priority" value={f.priority} onChange={set('priority')}>{['low', 'medium', 'high', 'urgent'].map((s) => <option key={s}>{s}</option>)}</Field>
          <Field as="select" label="Assign to" value={f.assigneeId} onChange={set('assigneeId')} error={fields.assigneeId}>
            <option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.fullName} ({ROLE_LABELS[m.role] || m.role})</option>)}
          </Field>
          <Field type="date" label="Start date" value={f.startDate} onChange={set('startDate')} error={fields.startDate} />
          <Field type="date" label="Due date" value={f.dueDate} onChange={set('dueDate')} error={fields.dueDate} />
          <Field as="select" label="Depends on" value={f.dependsOnTaskId} onChange={set('dependsOnTaskId')} hint="Cannot start until this task is done">
            <option value="">No dependency</option>{tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </Field>
        </div>
        <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Create task'}</button></div>
      </form>
    </Modal>
  );
}

function Team({ p, id, act }) {
  const [userId, setUserId] = useState('');
  const [key, setKey] = useState(0);
  return (
    <section className="card">
      <h2 style={{ fontSize: '1.1rem' }}>Project team</h2>
      <ul className="list">{p.members.map((m) => (
        <li key={m.id}><span><b>{m.fullName}</b><div className="muted small">{ROLE_LABELS[m.role] || m.role}</div></span>
          {p.canManage && <button className="btn btn-outline btn-sm" onClick={() => window.confirm(`Remove ${m.fullName} from this project?`) && act(() => api.delete(`/projects/${id}/members/${m.id}`), 'Member removed')}>Remove</button>}</li>))}
      </ul>
      {p.canManage && (
        <form className="row" style={{ alignItems: 'flex-end', marginTop: 12 }} onSubmit={async (e) => { e.preventDefault(); if (userId && await act(() => api.post(`/projects/${id}/members`, { userId: Number(userId) }), 'Member added')) { setUserId(''); setKey((k) => k + 1); } }}>
          <div style={{ minWidth: 240 }}><UserSelect key={key} roles={['engineer_architect', 'worker', 'project_manager', 'supplier', 'company']} label="Add a team member" value={userId} onChange={setUserId} emptyLabel="Choose a person..." /></div>
          <button className="btn btn-primary btn-sm" style={{ marginBottom: 16 }} disabled={!userId}>Add to project</button>
        </form>
      )}
    </section>
  );
}

function Budget({ p, id, user, reloadProject }) {
  const { data, loading, error, reload } = useFetch(`/projects/${id}/expenses`);
  const [f, setF] = useState({ category: 'material', description: '', amount: '', incurredOn: today() });
  const [fields, setFields] = useState({});
  const act = useAction(() => { reload(); reloadProject(); });
  const b = p.budget;
  const canAdd = user.role !== 'client';
  const max = Math.max(...Object.values(b.byCategory).map(Number), 1);
  const submit = async (e) => {
    e.preventDefault(); setFields({});
    try { await api.post(`/projects/${id}/expenses`, f); setF({ ...f, description: '', amount: '' }); reload(); reloadProject(); }
    catch (x) { setFields(readError(x).fields); }
  };
  return (
    <div className="grid cols-2">
      <section className="card">
        <h2 style={{ fontSize: '1.1rem' }}>Budget summary</h2>
        {b.overBudget && <div className="alert error" role="alert">This project is over budget.</div>}
        <dl className="kpi-bar" style={{ margin: 0 }}>
          <div><span className="muted small">Budget</span><b>{money(b.budget)}</b></div>
          <div><span className="muted small">Spent (approved)</span><b>{money(b.spent)}</b></div>
          <div><span className="muted small">Awaiting approval</span><b>{money(b.pending)}</b></div>
          <div><span className="muted small">Remaining</span><b>{money(b.remaining)}</b></div>
        </dl>
        <h3 style={{ fontSize: '.95rem' }}>Spending by category</h3>
        {Object.keys(b.byCategory).length === 0 ? <p className="muted">No approved expenses yet.</p> : Object.entries(b.byCategory).map(([k, v]) => (
          <div className="bar-row" key={k}><span>{label(k)}</span><Progress value={(Number(v) / max) * 100} /><span className="num">{money(v)}</span></div>))}
      </section>
      {canAdd && (
        <section className="card">
          <h2 style={{ fontSize: '1.1rem' }}>Record an expense</h2>
          <form onSubmit={submit} noValidate>
            <div className="form-grid">
              <Field as="select" label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{['labor', 'material', 'equipment', 'transport', 'other'].map((c) => <option key={c} value={c}>{label(c)}</option>)}</Field>
              <Field type="date" label="Date" value={f.incurredOn} onChange={(e) => setF({ ...f, incurredOn: e.target.value })} error={fields.incurredOn} />
              <Field type="number" min="0" step="0.01" label="Amount (RWF)" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} error={fields.amount} required />
            </div>
            <Field label="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} error={fields.description} required />
            <button className="btn btn-primary btn-sm">Submit for approval</button>
            <p className="hint">New expenses start as “pending”. A manager approves them before they count against the budget.</p>
          </form>
        </section>
      )}
      <section className="card flush" style={{ gridColumn: '1 / -1' }}>
        <h2 style={{ fontSize: '1.1rem', padding: '18px 20px 0' }}>Expenses</h2>
        {loading && <Spinner />}{error && <ErrorBox message={error} onRetry={reload} />}
        {data?.length === 0 && <EmptyState icon="🧾" title="No expenses to show" />}
        {data?.length > 0 && (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th className="num">Amount</th><th>By</th><th>Status</th><th /></tr></thead>
            <tbody>{data.map((e) => (
              <tr key={e.id}><td>{date(e.incurredOn)}</td><td>{label(e.category)}</td><td>{e.description}</td><td className="num">{money(e.amount)}</td><td>{e.createdByName}</td>
                <td><StatusBadge status={e.status} /></td>
                <td>{p.canManage && e.status === 'pending' && (
                  <span className="row"><button className="btn btn-sm btn-outline" onClick={() => act(() => api.patch(`/expenses/${e.id}/review`, { decision: 'approved' }), 'Expense approved')}>Approve</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => act(() => api.patch(`/expenses/${e.id}/review`, { decision: 'rejected' }), 'Expense rejected')}>Reject</button></span>)}</td></tr>))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}

function Messages({ id, user }) {
  const { data, loading, error, reload } = useFetch(`/projects/${id}/messages`);
  const [body, setBody] = useState('');
  const { toast } = useUi();
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [data]);
  const send = async (e) => {
    e.preventDefault(); if (!body.trim()) return;
    try { await api.post(`/projects/${id}/messages`, { body }); setBody(''); reload(); } catch (x) { toast(readError(x).message, 'error'); }
  };
  return (
    <section className="card">
      <h2 style={{ fontSize: '1.1rem' }}>Project messages</h2>
      {loading && !data && <Spinner />}{error && <ErrorBox message={error} onRetry={reload} />}
      {data?.length === 0 && <p className="muted">No messages yet. Start the conversation.</p>}
      <div aria-live="polite" style={{ maxHeight: 360, overflowY: 'auto' }}>
        {data?.map((m) => <div key={m.id} className={`msg ${m.userName === user.fullName ? 'mine' : ''}`}><div className="who">{m.userName} <span className="muted small">· {ROLE_LABELS[m.role] || m.role} · {dateTime(m.createdAt)}</span></div>{m.body}</div>)}
        <div ref={end} />
      </div>
      <form className="row" style={{ alignItems: 'flex-end', marginTop: 12 }} onSubmit={send}>
        <div style={{ flex: 1, minWidth: 200 }}><Field label="Write a message" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} /></div>
        <button className="btn btn-primary" style={{ marginBottom: 16 }}>Send</button>
      </form>
    </section>
  );
}

function EditProject({ p, onClose, onSaved }) {
  const { toast } = useUi();
  const [f, setF] = useState({
    title: p.title, description: p.description || '', location: p.location || '', status: p.status,
    plannedStart: p.plannedStart || '', plannedEnd: p.plannedEnd || '', estimatedBudget: p.estimatedBudget, approvedBudget: p.approvedBudget,
  });
  const [fields, setFields] = useState({}); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(''); setFields({});
    const body = { ...f }; ['plannedStart', 'plannedEnd', 'description', 'location'].forEach((k) => { if (body[k] === '') body[k] = null; });
    try { await api.patch(`/projects/${p.id}`, body); toast('Project updated'); onSaved(); }
    catch (x) { const r = readError(x); setError(r.message); setFields(r.fields); } finally { setBusy(false); }
  };
  return (
    <Modal title="Edit project" onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        {error && <div className="alert error" role="alert">{error}</div>}
        <Field label="Title" value={f.title} onChange={set('title')} error={fields.title} required />
        <Field as="textarea" rows={3} label="Description" value={f.description} onChange={set('description')} error={fields.description} />
        <div className="form-grid">
          <Field label="Location" value={f.location} onChange={set('location')} />
          <Field as="select" label="Status" value={f.status} onChange={set('status')}>{['planning', 'active', 'on_hold', 'completed', 'cancelled'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Field>
          <Field type="date" label="Planned start" value={f.plannedStart} onChange={set('plannedStart')} error={fields.plannedStart} />
          <Field type="date" label="Planned completion" value={f.plannedEnd} onChange={set('plannedEnd')} error={fields.plannedEnd} />
          <Field type="number" min="0" step="0.01" label="Estimated budget (RWF)" value={f.estimatedBudget} onChange={set('estimatedBudget')} error={fields.estimatedBudget} />
          <Field type="number" min="0" step="0.01" label="Approved budget (RWF)" value={f.approvedBudget} onChange={set('approvedBudget')} error={fields.approvedBudget} />
        </div>
        <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save changes'}</button></div>
      </form>
    </Modal>
  );
}
