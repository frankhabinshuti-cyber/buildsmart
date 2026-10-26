import { useState } from 'react';
import { api, readError } from '../api/client.js';
import { useFetch, useDebounced } from '../hooks.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { EmptyState, ErrorBox, Field, Modal, PageHeader, Pagination, Spinner, StatusBadge } from '../components/ui.jsx';
import { dateTime, money, number } from '../utils/format.js';

const MOVE_LABEL = { receipt: 'Goods received (+)', allocation: 'Allocate to project (-)', adjustment: 'Stock adjustment (+/-)' };

export default function Materials() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [low, setLow] = useState(false);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null); // { kind: 'new' | 'move' | 'history', material }
  const dq = useDebounced(q);
  const { data, meta, loading, error, reload } = useFetch('/materials', { q: dq || undefined, lowStock: low ? 'true' : undefined, page, limit: 10 });
  const canCatalog = ['super_admin', 'company', 'project_manager', 'supplier'].includes(user.role);
  const canMove = ['super_admin', 'company', 'project_manager'].includes(user.role);
  const close = () => setModal(null);

  return (
    <>
      <PageHeader title="Materials & inventory" subtitle="Track stock, costs and movements. Low-stock items are highlighted.">
        {canCatalog && <button className="btn btn-primary" onClick={() => setModal({ kind: 'new' })}>+ Add material</button>}
      </PageHeader>
      <form className="toolbar" role="search" onSubmit={(e) => e.preventDefault()}>
        <input className="input" aria-label="Search materials" placeholder="Search materials" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={low} onChange={(e) => { setLow(e.target.checked); setPage(1); }} /> Low stock only</label>
      </form>
      {loading && <Spinner />}{error && <ErrorBox message={error} onRetry={reload} />}
      {!loading && data?.length === 0 && <div className="card"><EmptyState icon="📦" title="No materials found">Add materials to start tracking stock.</EmptyState></div>}
      {data?.length > 0 && (
        <div className="card flush"><div className="table-wrap"><table className="table">
          <thead><tr><th>Material</th><th>Supplier</th><th className="num">Unit cost</th><th className="num">In stock</th><th className="num">Reorder at</th><th /></tr></thead>
          <tbody>{data.map((m) => (
            <tr key={m.id}>
              <td><b>{m.name}</b><div className="muted small">{m.category || 'General'} · per {m.unit}</div></td>
              <td>{m.supplierName || '-'}</td>
              <td className="num">{money(m.unitCost)}</td>
              <td className="num"><b>{number(m.stockQty)}</b> {m.unit} {Number(m.isLow) ? <span className="badge red">Low</span> : null}</td>
              <td className="num">{number(m.reorderLevel)}</td>
              <td><span className="row">
                {canMove && <button className="btn btn-outline btn-sm" onClick={() => setModal({ kind: 'move', material: m })}>Update stock</button>}
                <button className="btn btn-ghost btn-sm" onClick={() => setModal({ kind: 'history', material: m })}>History</button></span></td>
            </tr>))}</tbody>
        </table></div></div>
      )}
      <Pagination meta={meta} onPage={setPage} />
      {modal?.kind === 'new' && <NewMaterial onClose={close} onSaved={() => { close(); reload(); }} />}
      {modal?.kind === 'move' && <Movement material={modal.material} onClose={close} onSaved={() => { close(); reload(); }} />}
      {modal?.kind === 'history' && <MovementHistory material={modal.material} onClose={close} />}
    </>
  );
}

function NewMaterial({ onClose, onSaved }) {
  const { toast } = useUi();
  const { user } = useAuth();
  const suppliers = useFetch('/suppliers');
  const [f, setF] = useState({ name: '', category: '', unit: '', unitCost: '', reorderLevel: '', openingStock: '', supplierId: '', description: '' });
  const [fields, setFields] = useState({}); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(''); setFields({});
    const body = { ...f, unitCost: f.unitCost || '0', reorderLevel: f.reorderLevel || '0', openingStock: f.openingStock || '0' };
    Object.keys(body).forEach((k) => { if (body[k] === '') body[k] = null; });
    try { await api.post('/materials', body); toast('Material added'); onSaved(); }
    catch (x) { const r = readError(x); setError(r.message); setFields(r.fields); } finally { setBusy(false); }
  };
  return (
    <Modal title="Add material" onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        {error && <div className="alert error" role="alert">{error}</div>}
        <div className="form-grid">
          <Field label="Name" value={f.name} onChange={set('name')} error={fields.name} required />
          <Field label="Category" value={f.category} onChange={set('category')} error={fields.category} placeholder="e.g. Cement" />
          <Field label="Unit" value={f.unit} onChange={set('unit')} error={fields.unit} placeholder="bag, m3, kg..." required />
          <Field type="number" min="0" step="0.01" label="Unit cost (RWF)" value={f.unitCost} onChange={set('unitCost')} error={fields.unitCost} />
          <Field type="number" min="0" step="0.001" label="Opening stock" value={f.openingStock} onChange={set('openingStock')} error={fields.openingStock} />
          <Field type="number" min="0" step="0.001" label="Reorder level" value={f.reorderLevel} onChange={set('reorderLevel')} error={fields.reorderLevel} hint="You are alerted at or below this quantity" />
          {user.role !== 'supplier' && (
            <Field as="select" label="Supplier" value={f.supplierId} onChange={set('supplierId')} error={fields.supplierId}>
              <option value="">No supplier</option>{(suppliers.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Field>)}
        </div>
        <Field label="Description" value={f.description} onChange={set('description')} error={fields.description} />
        <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Add material'}</button></div>
      </form>
    </Modal>
  );
}

function Movement({ material, onClose, onSaved }) {
  const { toast } = useUi();
  const projects = useFetch('/projects', { limit: 50 });
  const [f, setF] = useState({ type: 'receipt', quantity: '', projectId: '', unitCost: '', note: '' });
  const [fields, setFields] = useState({}); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(''); setFields({});
    const body = { ...f };
    Object.keys(body).forEach((k) => { if (body[k] === '') body[k] = null; });
    if (f.type !== 'allocation') body.projectId = null;
    if (body.unitCost === null) delete body.unitCost; // optional: the server falls back to the catalog cost
    try {
      const r = await api.post(`/materials/${material.id}/movements`, body);
      toast(`Stock updated. New balance: ${number(r.data.data.balance)} ${material.unit}${r.data.data.lowStock ? ' (low stock!)' : ''}`);
      onSaved();
    } catch (x) { const r = readError(x); setError(r.message); setFields(r.fields); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Update stock: ${material.name}`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p className="muted small">Current stock: <b>{number(material.stockQty)} {material.unit}</b>. Stock can never go below zero.</p>
        {error && <div className="alert error" role="alert">{error}</div>}
        <Field as="select" label="Type" value={f.type} onChange={set('type')}>{Object.entries(MOVE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Field>
        <Field type="number" step="0.001" label={`Quantity (${material.unit})`} value={f.quantity} onChange={set('quantity')} error={fields.quantity} required hint={f.type === 'adjustment' ? 'Use a negative number to reduce stock' : undefined} />
        {f.type === 'allocation' && (
          <Field as="select" label="Project" value={f.projectId} onChange={set('projectId')} error={fields.projectId} required>
            <option value="">Choose a project...</option>{(projects.data || []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </Field>)}
        {f.type === 'receipt' && <Field type="number" min="0" step="0.01" label="Unit cost (RWF)" value={f.unitCost} onChange={set('unitCost')} error={fields.unitCost} hint={`Leave empty to use ${money(material.unitCost)}`} />}
        <Field label="Note" value={f.note} onChange={set('note')} error={fields.note} />
        <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save movement'}</button></div>
      </form>
    </Modal>
  );
}

function MovementHistory({ material, onClose }) {
  const { data, loading, error } = useFetch(`/materials/${material.id}/movements`, { limit: 30 });
  return (
    <Modal title={`Stock history: ${material.name}`} onClose={onClose} wide>
      {loading && <Spinner />}{error && <ErrorBox message={error} />}
      {data?.length === 0 && <p className="muted">No movements yet.</p>}
      {data?.length > 0 && (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>When</th><th>Type</th><th className="num">Qty</th><th className="num">Balance</th><th>Project / note</th><th>By</th></tr></thead>
          <tbody>{data.map((m) => (
            <tr key={m.id}><td>{dateTime(m.createdAt)}</td><td><StatusBadge status={m.type === 'receipt' ? 'received' : m.type} text={m.type} /></td>
              <td className="num">{number(m.quantity)}</td><td className="num">{number(m.balanceAfter)}</td><td>{m.projectTitle || m.note || '-'}</td><td>{m.userName}</td></tr>))}</tbody>
        </table></div>
      )}
      <div className="modal-actions"><button className="btn btn-outline" onClick={onClose}>Close</button></div>
    </Modal>
  );
}
