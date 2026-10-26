import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, readError } from '../api/client.js';
import { useFetch } from '../hooks.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { Spinner, ErrorBox, Stars, Field } from '../components/ui.jsx';
import { money, date } from '../utils/format.js';

export default function ServiceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { toast } = useUi();
  const { data: s, loading, error, reload } = useFetch(`/marketplace/services/${id}`);
  const [rating, setRating] = useState('5');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (loading) return <Spinner />;
  if (error) return <div className="container" style={{ padding: 40 }}><ErrorBox message={error} /></div>;

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api.post(`/marketplace/services/${id}/reviews`, { rating: Number(rating), comment }); toast('Thank you for your review'); setComment(''); reload(); }
    catch (x) { setErr(readError(x).message); } finally { setBusy(false); }
  };

  return (
    <div className="container" style={{ padding: '32px 16px 60px' }}>
      <div className="crumbs"><Link to="/marketplace" style={{ color: 'var(--accent-text)', fontWeight: 700, textDecoration: 'none' }}>Marketplace</Link> / {s.category}</div>
      <div className="grid cols-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
        <div className="card">
          <span className="badge blue">{s.category}</span>
          <h1 style={{ marginTop: 10 }}>{s.title}</h1>
          <p className="muted">{s.companyName || s.providerName} · {s.location || 'Rwanda'} {s.companyVerified ? <span className="badge green">Verified company</span> : null}</p>
          <p>{s.description}</p>
          <div className="kpi-bar">
            <div><span className="muted small">Starting price</span><b>{s.priceFrom ? money(s.priceFrom) : 'On request'}</b></div>
            <div><span className="muted small">Rating</span><b>{s.reviewCount ? <><Stars value={s.avgRating} /> {s.avgRating}</> : '-'}</b></div>
          </div>
          {user?.role === 'client'
            ? <Link to="/app/quotations" className="btn btn-primary">Request a quotation</Link>
            : !user ? <Link to="/register" className="btn btn-primary">Create an account to request a quote</Link> : null}
        </div>
        <div className="card">
          <h2>Reviews ({s.reviews.length})</h2>
          {s.reviews.length === 0 && <p className="muted">No reviews yet.</p>}
          <ul className="list">
            {s.reviews.map((r) => (
              <li key={r.id}><div><b>{r.reviewerName}</b> <Stars value={r.rating} /><div className="muted small">{date(r.createdAt)}</div>{r.comment && <p style={{ margin: '6px 0 0' }}>{r.comment}</p>}</div></li>
            ))}
          </ul>
          {user?.role === 'client' && (
            <form onSubmit={submit} style={{ marginTop: 16 }}>
              <h3>Leave a review</h3>
              {err && <div className="alert error" role="alert">{err}</div>}
              <Field label="Rating" as="select" value={rating} onChange={(e) => setRating(e.target.value)}>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} - {['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'][n]}</option>)}
              </Field>
              <Field label="Comment (optional)" as="textarea" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending...' : 'Submit review'}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
