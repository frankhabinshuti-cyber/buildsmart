import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router-dom';
import { label as fmtLabel, tone } from '../utils/format.js';

export function Spinner({ text = 'Loading...' }) {
  return <div className="loading" role="status"><div className="spinner" aria-hidden="true" /><span>{text}</span></div>;
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div className="alert error" role="alert">
      {message} {onRetry && <button className="btn btn-sm btn-outline" onClick={onRetry} style={{ marginLeft: 8 }}>Try again</button>}
    </div>
  );
}

export function EmptyState({ icon = '📭', title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function StatusBadge({ status, text }) {
  return <span className={`badge ${tone(status)}`}>{text ?? fmtLabel(status)}</span>;
}

export function PageHeader({ title, subtitle, crumbs, children }) {
  return (
    <div className="page-head">
      <div>
        {crumbs && <div className="crumbs">{crumbs.map((c, i) => (<span key={i}>{c.to ? <Link to={c.to}>{c.label}</Link> : c.label}{i < crumbs.length - 1 ? ' / ' : ''}</span>))}</div>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

export function Stat({ icon, value, label, tone: t = '' }) {
  return (
    <div className="card stat">
      <div className={`stat-icon ${t}`} aria-hidden="true">{icon}</div>
      <div><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div>
    </div>
  );
}

export function Progress({ value, over }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return <div className={`progress ${over ? 'over' : ''}`} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={`${v}% complete`}><span style={{ width: `${v}%` }} /></div>;
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.pages <= 1) return meta ? <div className="pager"><span className="muted small">{meta.total} result{meta.total === 1 ? '' : 's'}</span></div> : null;
  return (
    <nav className="pager" aria-label="Pagination">
      <span className="muted small">Page {meta.page} of {meta.pages} · {meta.total} results</span>
      <span className="row">
        <button className="btn btn-sm btn-outline" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>Previous</button>
        <button className="btn btn-sm btn-outline" disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)}>Next</button>
      </span>
    </nav>
  );
}

/** Label + control + error text, wired together for screen readers. */
export function Field({ label, error, hint, as = 'input', children, className = '', ...props }) {
  const id = useId();
  const Tag = as;
  const describedBy = [error && `${id}-err`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}{props.required ? <span aria-hidden="true"> *</span> : null}</label>
      <Tag id={id} className={`input ${className}`} aria-invalid={error ? 'true' : undefined} aria-describedby={describedBy} {...props}>{children}</Tag>
      {hint && <span className="hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="field-error" id={`${id}-err`} role="alert">{error}</span>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const first = ref.current?.querySelector('input, select, textarea, button:not(.modal-close)');
    (first || ref.current)?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
        if (!f.length) return;
        const [a, z] = [f[0], f[f.length - 1]];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="btn btn-ghost btn-sm modal-close" onClick={onClose} aria-label="Close dialog">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stars({ value }) {
  const v = Math.round(Number(value) || 0);
  return <span className="stars" role="img" aria-label={`${value || 0} out of 5 stars`}>{'★'.repeat(v)}{'☆'.repeat(5 - v)}</span>;
}
