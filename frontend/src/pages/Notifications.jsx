import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useFetch } from '../hooks.js';
import { EmptyState, ErrorBox, PageHeader, Pagination, Spinner } from '../components/ui.jsx';
import { dateTime } from '../utils/format.js';

const ICON = { task: '✔', project: '🏗', quotation: '🧾', expense: '💰', budget: '⚠', message: '💬', progress: '📈', stock: '📦' };

export default function Notifications() {
  const nav = useNavigate();
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload } = useFetch('/notifications', { page, limit: 15 });
  const changed = () => window.dispatchEvent(new Event('notifications-changed'));

  const open = async (n) => {
    if (!n.isRead) { await api.patch(`/notifications/${n.id}/read`).catch(() => {}); changed(); reload(); }
    if (n.link) nav(n.link);
  };
  const readAll = async () => { await api.post('/notifications/read-all'); changed(); reload(); };

  return (
    <>
      <PageHeader title="Notifications" subtitle={meta ? `${meta.unread} unread` : ''}>
        <button className="btn btn-outline btn-sm" onClick={readAll} disabled={!meta?.unread}>Mark all as read</button>
      </PageHeader>
      {loading && !data && <Spinner />}{error && <ErrorBox message={error} onRetry={reload} />}
      {data?.length === 0 && <div className="card"><EmptyState icon="🔔" title="You are all caught up">Task assignments, quotations and project updates will appear here.</EmptyState></div>}
      {data?.length > 0 && (
        <div className="card flush"><ul className="list" style={{ padding: '0 20px' }}>
          {data.map((n) => (
            <li key={n.id} style={n.isRead ? { opacity: 0.7 } : { background: 'var(--surface-2)', margin: '0 -20px', padding: '12px 20px' }}>
              <button className="btn btn-ghost" style={{ textAlign: 'left', width: '100%', justifyContent: 'flex-start', height: 'auto' }} onClick={() => open(n)}>
                <span aria-hidden="true" style={{ marginRight: 10 }}>{ICON[n.type] || '🔔'}</span>
                <span><b>{n.title}</b>{!n.isRead && <span className="badge orange" style={{ marginLeft: 8 }}>New</span>}<div className="muted small">{n.body}</div></span>
              </button>
              <span className="muted small" style={{ whiteSpace: 'nowrap' }}>{dateTime(n.createdAt)}</span>
            </li>))}
        </ul></div>
      )}
      <Pagination meta={meta} onPage={setPage} />
    </>
  );
}
