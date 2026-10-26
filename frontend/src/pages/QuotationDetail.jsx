import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, readError } from '../api/client.js';
import { useFetch } from '../hooks.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { EmptyState, ErrorBox, Field, PageHeader, Spinner, StatusBadge } from '../components/ui.jsx';
import { date, label, money, number } from '../utils/format.js';

const KINDS = ['material', 'labor', 'equipment', 'transport', 'other'];
const blank = () => ({ kind: 'material', description: '', quantity: '1', unitPrice: '' });

export default function QuotationDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { toast } = useUi();
  const { data: r, loading, error, reload } = useFetch(`/quotation-requests/${id}`);
  const [showHistory, setShowHistory] = useState(false);
  if (loading && !r) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  const canQuote = !r.isOwner && user.role !== 'client' && user.role !== 'super_admin' && r.status === 'open';
  // Newest version per provider first; older versions are history.
  const latest = new Map();
  for (const q of r.quotations) if (!latest.has(q.providerId) && q.status !== 'superseded') latest.set(q.providerId, q);
  const current = [...latest.values()];
  const history = r.quotations.filter((q) => q.status === 'superseded');

  const decide = async (q, decision) => {
    if (!window.confirm(decision === 'accept' ? `Accept the quotation from ${q.companyName || q.providerName} for ${money(q.total)}? Other open quotations will be declined.` : 'Decline this quotation?')) return;
    try { await api.post(`/quotations/${q.id}/${decision}`); toast(decision === 'accept' ? 'Quotation accepted' : 'Quotation declined'); reload(); }
    catch (x) { toast(readError(x).message, 'error'); reload(); }
  };

  return (
    <>
      <PageHeader title={r.title} subtitle={`${r.clientName} · ${r.location || 'Rwanda'}${r.category ? ` · ${r.category}` : ''}`} crumbs={[{ label: 'Quotations', to: '/app/quotations' }, { label: r.title }]}>
        <StatusBadge status={r.status} />
      </PageHeader>
      <section className="card" style={{ marginBottom: 18 }}>
        <p style={{ marginTop: 0 }}>{r.description || 'No further details given.'}</p>
        <p className="muted small" style={{ marginBottom: 0 }}>{r.budgetHint ? `Client budget idea: ${money(r.budgetHint)}` : 'No budget given'}</p>
      </section>

      <h2 style={{ fontSize: '1.2rem' }}>{r.isOwner ? 'Quotations received' : 'Your quotation'}</h2>
      {current.length === 0 && <div className="card"><EmptyState icon="📨" title="No quotations yet">{r.isOwner ? 'Providers will send quotations soon. You will be notified.' : 'Be the first to send one below.'}</EmptyState></div>}
      <div className="stack">
        {current.map((q) => <QuoteCard key={q.id} q={q} canDecide={(r.isOwner || user.role === 'super_admin') && q.status === 'submitted'} onDecide={decide} />)}
      </div>

      {history.length > 0 && (
        <p><button className="btn btn-ghost btn-sm" onClick={() => setShowHistory(!showHistory)}>{showHistory ? 'Hide' : 'Show'} {history.length} earlier version{history.length > 1 ? 's' : ''}</button></p>
      )}
      {showHistory && <div className="stack">{history.map((q) => <QuoteCard key={q.id} q={q} />)}</div>}

      {canQuote && <QuoteForm requestId={id} hasQuote={current.some((q) => q.providerId === user.id)} onSent={reload} />}
    </>
  );
}

function QuoteCard({ q, canDecide, onDecide }) {
  return (
    <article className="card">
      <div className="row between">
        <div><b>{q.companyName || q.providerName}</b> <span className="muted small">· version {q.version} · valid until {date(q.validUntil)}</span></div>
        <StatusBadge status={q.status} />
      </div>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Item</th><th>Type</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Total</th></tr></thead>
        <tbody>{q.items.map((i, k) => <tr key={k}><td>{i.description}</td><td>{label(i.kind)}</td><td className="num">{number(i.quantity)}</td><td className="num">{money(i.unitPrice)}</td><td className="num">{money(i.lineTotal)}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan={4} className="num"><b>Total</b></td><td className="num"><b>{money(q.total)}</b></td></tr></tfoot>
      </table></div>
      {q.notes && <p className="small muted">Note: {q.notes}</p>}
      {canDecide && (
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn btn-primary btn-sm" onClick={() => onDecide(q, 'accept')}>Accept quotation</button>
          <button className="btn btn-outline btn-sm" onClick={() => onDecide(q, 'reject')}>Decline</button>
        </div>
      )}
    </article>
  );
}

function QuoteForm({ requestId, hasQuote, onSent }) {
  const { toast } = useUi();
  const [items, setItems] = useState([blank()]);
  const [validUntil, setValidUntil] = useState(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(''); const [fields, setFields] = useState({}); const [busy, setBusy] = useState(false);
  const setItem = (i, k, v) => setItems((list) => list.map((it, n) => (n === i ? { ...it, [k]: v } : it)));
  // Preview only. The server recalculates every total, so this cannot be used to cheat.
  const preview = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(''); setFields({});
    try {
      await api.post(`/quotation-requests/${requestId}/quotations`, { validUntil, notes: notes || null, items: items.map((i) => ({ ...i, quantity: String(i.quantity), unitPrice: String(i.unitPrice) })) });
      toast(hasQuote ? 'New version sent' : 'Quotation sent'); setItems([blank()]); setNotes(''); onSent();
    } catch (x) { const r = readError(x); setError(r.message); setFields(r.fields); } finally { setBusy(false); }
  };

  return (
    <section className="card" style={{ marginTop: 22 }}>
      <h2 style={{ fontSize: '1.15rem' }}>{hasQuote ? 'Send a revised quotation' : 'Send a quotation'}</h2>
      {hasQuote && <p className="muted small">Your earlier version is kept as history and replaced by this one.</p>}
      <form onSubmit={submit} noValidate>
        {error && <div className="alert error" role="alert">{error}</div>}
        {fields.items && <div className="alert error" role="alert">{fields.items}</div>}
        {items.map((it, i) => (
          <div className="item-row" key={i}>
            <select className="input" aria-label={`Item ${i + 1} type`} value={it.kind} onChange={(e) => setItem(i, 'kind', e.target.value)}>{KINDS.map((k) => <option key={k} value={k}>{label(k)}</option>)}</select>
            <input className="input" aria-label={`Item ${i + 1} description`} placeholder="Description" value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} required />
            <input className="input" aria-label={`Item ${i + 1} quantity`} type="number" min="0" step="0.001" placeholder="Qty" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} required />
            <input className="input" aria-label={`Item ${i + 1} unit price`} type="number" min="0" step="0.01" placeholder="Unit price" value={it.unitPrice} onChange={(e) => setItem(i, 'unitPrice', e.target.value)} required />
            <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove item ${i + 1}`} disabled={items.length === 1} onClick={() => setItems((l) => l.filter((_, n) => n !== i))}>✕</button>
          </div>
        ))}
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setItems((l) => [...l, blank()])}>+ Add item</button>
        <p><b>Estimated total: {money(preview)}</b> <span className="muted small">(final amount is calculated by the server)</span></p>
        <div className="form-grid">
          <Field type="date" label="Valid until" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} error={fields.validUntil} required />
          <Field label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} error={fields.notes} />
        </div>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending...' : hasQuote ? 'Send new version' : 'Send quotation'}</button>
      </form>
    </section>
  );
}
