import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, readError } from '../api/client.js';
import { useFetch } from '../hooks.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { EmptyState, ErrorBox, Modal, PageHeader, Pagination, Spinner, StatusBadge } from '../components/ui.jsx';
import { date, dateTime, label } from '../utils/format.js';

const STATUSES = ['todo', 'in_progress', 'blocked', 'done'];

export default function Tasks() {
  const { user } = useAuth();
  const { toast } = useUi();
  const [status, setStatus] = useState('');
  const [mine, setMine] = useState(user.role === 'worker');
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState(null);
  const { data, meta, loading, error, reload } = useFetch('/tasks', { status: status || undefined, mine: mine ? 'true' : undefined, page, limit: 12 });
  const isManager = ['super_admin', 'company', 'project_manager'].includes(user.role);

  const change = async (t, next) => {
    try { await api.patch(`/tasks/${t.id}`, { status: next }); toast('Task updated'); reload(); }
    catch (x) { toast(readError(x).message, 'error'); reload(); }
  };

  return (
    <>
      <PageHeader title="Tasks" subtitle={user.role === 'worker' ? 'Your assigned tasks and deadlines.' : 'Tasks across your projects. Overdue items are flagged.'} />
      <div className="toolbar">
        <select className="input" aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        {user.role !== 'worker' && <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(1); }} /> Only tasks assigned to me</label>}
      </div>
      {loading && <Spinner />}{error && <ErrorBox message={error} onRetry={reload} />}
      {!loading && data?.length === 0 && <div className="card"><EmptyState icon="✔" title="No tasks found">Nothing matches these filters. Tasks are created inside a project.</EmptyState></div>}
      {data?.length > 0 && (
        <div className="card flush"><div className="table-wrap"><table className="table">
          <thead><tr><th>Task</th><th>Project</th><th>Assignee</th><th>Priority</th><th>Due</th><th>Status</th><th /></tr></thead>
          <tbody>{data.map((t) => (
            <tr key={t.id}>
              <td><b>{t.title}</b></td>
              <td><Link className="link" to={`/app/projects/${t.projectId}`}>{t.projectTitle}</Link></td>
              <td>{t.assigneeName || '-'}</td>
              <td><StatusBadge status={t.priority} /></td>
              <td>{date(t.dueDate)} {t.isOverdue ? <span className="badge red">Overdue</span> : null}</td>
              <td>{(isManager || t.assigneeId === user.id)
                ? <select className="input" aria-label={`Status of ${t.title}`} value={t.status} onChange={(e) => change(t, e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
                : <StatusBadge status={t.status} />}</td>
              <td><button className="btn btn-ghost btn-sm" onClick={() => setHistory(t)}>History</button></td>
            </tr>))}</tbody>
        </table></div></div>
      )}
      <Pagination meta={meta} onPage={setPage} />
      {history && <History task={history} onClose={() => setHistory(null)} />}
    </>
  );
}

function History({ task, onClose }) {
  const { data, loading, error } = useFetch(`/tasks/${task.id}/history`);
  return (
    <Modal title={`History: ${task.title}`} onClose={onClose}>
      {loading && <Spinner />}{error && <ErrorBox message={error} />}
      {data?.length === 0 && <p className="muted">No changes recorded.</p>}
      <ul className="list">{data?.map((e) => (
        <li key={e.id}><span>{e.fromStatus ? <>{label(e.fromStatus)} → <b>{label(e.toStatus)}</b></> : <b>{e.note || label(e.toStatus)}</b>}<div className="muted small">{e.userName}{e.note && e.fromStatus ? ` · ${e.note}` : ''}</div></span><span className="muted small">{dateTime(e.createdAt)}</span></li>))}</ul>
      <div className="modal-actions"><button className="btn btn-outline" onClick={onClose}>Close</button></div>
    </Modal>
  );
}
