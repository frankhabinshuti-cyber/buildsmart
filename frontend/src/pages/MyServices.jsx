import { useEffect, useState } from 'react';
import { api, readError } from '../api/client.js';
import { useFetch } from '../hooks.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { EmptyState, ErrorBox, Field, Modal, PageHeader, Spinner, Stars } from '../components/ui.jsx';
import { money } from '../utils/format.js';

export default function MyServices() {
  const { user } = useAuth();
  const { toast } = useUi();
  const { data, loading, error, reload } = useFetch('/marketplace/services/mine');
  const [editing, setEditing] = useState(null); // null | 'new' | service

  const remove = async (s) => {
    if (!window.confirm(`Remove "${s.title}" from the marketplace?`)) return;
    try { await api.delete(`/marketplace/services/${s.id}`); toast('Service removed'); reload(); } catch (x) { toast(readError(x).message, 'error'); }
  };

  return (
    <>
      <PageHeader title="My services" subtitle="Publish what you offer so clients can find and contact you.">
        <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Add service</button>
      </PageHeader>
      {user.role === 'company' && <CompanyProfile />}
      {loading && <Spinner />}{error && <ErrorBox message={error} onRetry={reload} />}
      {!loading && data?.length === 0 && <div className="card"><EmptyState icon="🛠" title="You have not published a service yet" action={<button className="btn btn-primary" onClick={() => setEditing('new')}>Add your first service</button>}>Clients search the marketplace by category and location.</EmptyState></div>}
      <div className="grid cols-3">
        {data?.map((s) => (
          <article className="card service-card" key={s.id}>
            <div className="row between"><span className="badge blue">{s.category}</span><span className={`badge ${Number(s.isPublished) ? 'green' : ''}`}>{Number(s.isPublished) ? 'Published' : 'Hidden'}</span></div>
            <h3>{s.title}</h3>
            <p className="muted small" style={{ margin: 0 }}>{s.location || 'Rwanda'} · from {money(s.priceFrom)}</p>
            <p style={{ margin: 0 }}>{(s.description || '').slice(0, 110)}</p>
            <div className="row between"><span><Stars value={s.avgRating} /> <span className="muted small">({s.reviewCount})</span></span>
              <span className="row"><button className="btn btn-outline btn-sm" onClick={() => setEditing(s)}>Edit</button><button className="btn btn-ghost btn-sm" onClick={() => remove(s)}>Remove</button></span></div>
          </article>
        ))}
      </div>
      {editing && <ServiceModal service={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function ServiceModal({ service, onClose, onSaved }) {
  const { toast } = useUi();
  const cats = useFetch('/marketplace/categories');
  const [f, setF] = useState({ categoryId: service?.categoryId ?? '', title: service?.title ?? '', description: service?.description ?? '', location: service?.location ?? '', priceFrom: service?.priceFrom ?? '', isPublished: service ? Boolean(Number(service.isPublished)) : true });
  const [fields, setFields] = useState({}); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(''); setFields({});
    const body = { ...f, categoryId: Number(f.categoryId) || undefined, priceFrom: f.priceFrom === '' ? null : String(f.priceFrom) };
    try {
      if (service) await api.put(`/marketplace/services/${service.id}`, body);
      else await api.post('/marketplace/services', body);
      toast('Service saved'); onSaved();
    }
    catch (x) { const r = readError(x); setError(r.message); setFields(r.fields); } finally { setBusy(false); }
  };
  return (
    <Modal title={service ? 'Edit service' : 'Add a service'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        {error && <div className="alert error" role="alert">{error}</div>}
        <Field label="Title" value={f.title} onChange={set('title')} error={fields.title} required />
        <Field as="select" label="Category" value={f.categoryId} onChange={set('categoryId')} error={fields.categoryId} required>
          <option value="">Choose...</option>{(cats.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Field>
        <Field as="textarea" rows={3} label="Description" value={f.description} onChange={set('description')} error={fields.description} />
        <div className="form-grid">
          <Field label="Location" value={f.location} onChange={set('location')} error={fields.location} />
          <Field type="number" min="0" step="0.01" label="Price from (RWF)" value={f.priceFrom} onChange={set('priceFrom')} error={fields.priceFrom} />
        </div>
        <label className="row small" style={{ gap: 8, marginBottom: 12 }}><input type="checkbox" checked={f.isPublished} onChange={(e) => setF({ ...f, isPublished: e.target.checked })} /> Visible in the public marketplace</label>
        <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save service'}</button></div>
      </form>
    </Modal>
  );
}

function CompanyProfile() {
  const { toast } = useUi();
  const { data, loading, reload } = useFetch('/companies/mine');
  const [f, setF] = useState({ name: '', description: '', location: '', phone: '', email: '', website: '' });
  const [fields, setFields] = useState({}); const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setF({ name: data.name || '', description: data.description || '', location: data.location || '', phone: data.phone || '', email: data.email || '', website: data.website || '' }); }, [data]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setFields({});
    try { await api.put('/companies/mine', f); toast('Company profile saved'); reload(); } catch (x) { const r = readError(x); setFields(r.fields); toast(r.message, 'error'); } finally { setBusy(false); }
  };
  if (loading) return null;
  return (
    <section className="card" style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: '1.1rem' }}>Company profile {data?.isVerified ? <span className="badge green">Verified</span> : null}</h2>
      <form onSubmit={save} noValidate>
        <div className="form-grid">
          <Field label="Company name" value={f.name} onChange={set('name')} error={fields.name} required />
          <Field label="Location" value={f.location} onChange={set('location')} error={fields.location} />
          <Field label="Phone" value={f.phone} onChange={set('phone')} error={fields.phone} />
          <Field type="email" label="Email" value={f.email} onChange={set('email')} error={fields.email} />
          <Field label="Website" value={f.website} onChange={set('website')} error={fields.website} />
        </div>
        <Field as="textarea" rows={2} label="About your company" value={f.description} onChange={set('description')} error={fields.description} />
        <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving...' : 'Save company profile'}</button>
      </form>
    </section>
  );
}
