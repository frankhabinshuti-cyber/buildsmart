import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch, useDebounced } from '../hooks.js';
import { Spinner, ErrorBox, EmptyState, Pagination, Stars } from '../components/ui.jsx';
import { money } from '../utils/format.js';

export default function Marketplace() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q); const dl = useDebounced(location);
  const cats = useFetch('/marketplace/categories');
  const { data, meta, loading, error, reload } = useFetch('/marketplace/services', { q: dq || undefined, category: category || undefined, location: dl || undefined, page, limit: 9 });

  return (
    <div className="container" style={{ padding: '36px 16px 60px' }}>
      <div className="page-head">
        <div><h1>Find construction professionals</h1><p>Search services by type and location. Compare providers and read reviews from real clients.</p></div>
      </div>
      <form className="toolbar" role="search" onSubmit={(e) => e.preventDefault()}>
        <input className="input" aria-label="Search services" placeholder="Search: plumbing, architect, roofing..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select className="input" aria-label="Category" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
          <option value="">All categories</option>
          {(cats.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className="input" aria-label="Location" placeholder="Location (e.g. Kigali)" value={location} onChange={(e) => { setLocation(e.target.value); setPage(1); }} />
      </form>
      {loading && <Spinner />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!loading && !error && data?.length === 0 && <div className="card"><EmptyState icon="🔎" title="No services match your search">Try a different category or location.</EmptyState></div>}
      {!loading && data?.length > 0 && (
        <>
          <div className="grid cols-3">
            {data.map((s) => (
              <article className="card service-card" key={s.id}>
                <div className="row between"><span className="badge blue">{s.category}</span>{s.companyVerified ? <span className="badge green">Verified</span> : null}</div>
                <h3><Link to={`/marketplace/${s.id}`} className="link" style={{ color: 'var(--heading)' }}>{s.title}</Link></h3>
                <p className="muted small" style={{ margin: 0 }}>{s.companyName || s.providerName} · {s.location || 'Rwanda'}</p>
                <p style={{ margin: 0 }}>{(s.description || '').slice(0, 110)}{(s.description || '').length > 110 ? '…' : ''}</p>
                <div className="row between">
                  <span>{s.reviewCount > 0 ? <><Stars value={s.avgRating} /> <span className="small muted">({s.reviewCount})</span></> : <span className="small muted">No reviews yet</span>}</span>
                  <b>{s.priceFrom ? `from ${money(s.priceFrom)}` : 'Request a quote'}</b>
                </div>
              </article>
            ))}
          </div>
          <div className="card flush" style={{ marginTop: 16 }}><Pagination meta={meta} onPage={setPage} /></div>
        </>
      )}
    </div>
  );
}
