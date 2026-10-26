import { Link } from 'react-router-dom';
import { useState } from 'react';

/**
 * Brand rules (see brand guide): never stretch (height is fixed, width is automatic), never recolor,
 * minimum width 120px, keep clear space (padding). Use the white version on dark backgrounds
 * and the icon-only version for small spaces and the favicon.
 */
const FILES = {
  full: '/images/buildsmart-logo.png',
  white: '/images/buildsmart-logo-white.png',
  icon: '/images/buildsmart-icon.png',
  'icon-white': '/images/buildsmart-icon-white.png',
};

export default function Logo({ variant = 'full', height, to = '/', label = 'BuildSmart home' }) {
  const [failed, setFailed] = useState(false);
  const icon = variant.startsWith('icon');
  const content = failed ? (
    <span style={{ fontWeight: 800, fontSize: '1.4rem', color: variant.includes('white') || variant === 'white' ? '#fff' : 'var(--navy)' }}>
      Build<span style={{ color: 'var(--orange)' }}>Smart</span>
    </span>
  ) : (
    <img src={FILES[variant]} alt="BuildSmart - Building the future, intelligently" style={height ? { height } : undefined} onError={() => setFailed(true)} />
  );
  return to ? <Link to={to} className={`logo ${icon ? 'icon' : ''}`} aria-label={label}>{content}</Link> : <span className={`logo ${icon ? 'icon' : ''}`}>{content}</span>;
}
