import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, readError } from '../api/client.js';
import { useFetch } from '../hooks.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { EmptyState, ErrorBox, Field, Modal, PageHeader, Spinner, StatusBadge } from '../components/ui.jsx';
import { date, money } from '../utils/format.js';

export default function Quotations() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { data, loading, error, reload } = useFetch('/quotation-requests');
  const [creating, setCreating] = useState(false);
  const isClient = user.role === 'client';
  const canQuote = ['company', 'engineer_architect', 'worker', 'supplier', 'project_manager'].includes(user.role);

  return (
    <>
      <PageHeader title={isClient ? 'My quotation requests' : 'Open quotation requests'}
        subtitle={isClient ? 'Describe the work you need and compare itemised quotations from providers.' : 'Browse requests from clients and send itemised quotations.'}>
        {isClient && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New request</button>}
      </PageHeader>
      {loading && <Spinner />}{error && <ErrorBox message={error} onRetry={reload} />}
      {!loading && data?.length === 0 && (
        <div className="card"><EmptyState icon="🧾" title="No requests yet" action={isClient ? <button className="btn btn-primary" onClick={() => setCreating(true)}>Create a request</button> : null}>
          {isClient ? 'Create a request and providers will send you quotations.' : 'There are no open requests right now. Check back soon.'}</EmptyState></div>
      )}
      {data?.length > 0 && (
        <div className="grid cols-2">
          {data.map((r) => (
            <article className="card" key={r.id}>
              <div className="row between"><span className="badge blue">{r.category || 'General'}</span><StatusBadge status={r.status} /></div>
              <h3 style={{ marginBottom: 4 }}><Link className="link" style={{ color: 'var(--heading)' }} to={`/app/quotations/${r.id}`}>{r.title}</Link></h3>
              <p className="muted small" style={{ margin: 0 }}>{r.clientName} · {r.location || 'Rwanda'} · {date(r.createdAt)}</p>
              <p>{(r.description || '').slice(0, 130)}{(r.description || '').length > 130 ? '…' : ''}</p>
              <div className="row between">
                <span className="small">{r.budgetHint ? `Budget idea: ${money(r.budgetHint)}` : 'No budget given'}</span>
                {isClient ? <span className="badge">{r.quotationCount} quotation{Number(r.quotationCount) === 1 ? '' : 's'}</span>
                  : r.myQuotationId ? <span className="badge green">You quoted</span>
                    : canQuote ? <Link className="btn btn-outline btn-sm" to={`/app/quotations/${r.id}`}>Send quotation</Link> : null}
              </div>
            </article>
          ))}
        </div>
      )}
      {creating && <NewRequest onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); nav(`/app/quotations/${id}`); }} />}
    </>
  );
}

function NewRequest({ onClose, onSaved }) {
  const { toast } = useUi();
  const cats = useFetch('/marketplace/categories');
  const [f, setF] = useState({ title: '', description: '', location: '', categoryId: '', budgetHint: '' });
  const [fields, setFields] = useState({}); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(''); setFields({});
    const body = { ...f }; Object.keys(body).forEach((k) => { if (body[k] === '') body[k] = null; });
    try { const r = await api.post('/quotation-requests', body); toast('Request sent to providers'); onSaved(r.data.data.id); }
    catch (x) { const r = readError(x); setError(r.message); setFields(r.fields); } finally { setBusy(false); }
  };
  return (
    <Modal title="New quotation request" onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        {error && <div className="alert error" role="alert">{error}</div>}
        <Field label="What do you need?" value={f.title} onChange={set('title')} error={fields.title} placeholder="e.g. Roof replacement for a 3-bedroom house" required />
        <Field as="textarea" rows={4} label="Details" value={f.description} onChange={set('description')} error={fields.description} />
        <div className="form-grid">
          <Field label="Location" value={f.location} onChange={set('location')} error={fields.location} />
          <Field as="select" label="Category" value={f.categoryId} onChange={set('categoryId')} error={fields.categoryId}>
            <option value="">Any</option>{(cats.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Field>
          <Field type="number" min="0" step="0.01" label="Budget idea (RWF, optional)" value={f.budgetHint} onChange={set('budgetHint')} error={fields.budgetHint} />
        </div>
        <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Sending...' : 'Send request'}</button></div>
      </form>
    </Modal>
  );
}
