import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Logo from './Logo.jsx';
import { Spinner } from './ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { api } from '../api/client.js';
import { ROLE_LABELS } from '../utils/format.js';

// Menu items per role. This only controls what is SHOWN: the API enforces permissions itself.
const NAV = [
  { to: '/app', label: 'Dashboard', icon: '▦', end: true },
  { to: '/app/projects', label: 'Projects', icon: '🏗', roles: ['super_admin', 'company', 'project_manager', 'client', 'engineer', 'worker'] },
  { to: '/app/tasks', label: 'Tasks', icon: '✔', roles: ['super_admin', 'company', 'project_manager', 'engineer', 'worker'] },
  { to: '/app/materials', label: 'Materials', icon: '📦', roles: ['super_admin', 'company', 'project_manager', 'engineer', 'worker', 'supplier'] },
  { to: '/app/quotations', label: 'Quotations', icon: '🧾' },
  { to: '/app/services', label: 'My services', icon: '🛠', roles: ['company', 'engineer', 'worker', 'supplier', 'project_manager'] },
  { to: '/marketplace', label: 'Marketplace', icon: '🔎' },
  { group: 'Administration', roles: ['super_admin'] },
  { to: '/app/admin/users', label: 'Users', icon: '👥', roles: ['super_admin'] },
  { to: '/app/admin/audit', label: 'Audit log', icon: '🛡', roles: ['super_admin'] },
];

export default function AppLayout() {
  const { user, loading, logout } = useAuth();
  const { theme, toggleTheme } = useUi();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    if (!user) return undefined;
    const load = () => api.get('/notifications/unread-count').then((r) => setUnread(Number(r.data.data.unread))).catch(() => {});
    load();
    const t = setInterval(load, 45000);
    window.addEventListener('notifications-changed', load);
    return () => { clearInterval(t); window.removeEventListener('notifications-changed', load); };
  }, [user, loc.pathname]);

  if (loading) return <Spinner text="Loading your workspace..." />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;

  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role));
  return (
    <div className="app">
      <a href="#content" className="skip-link">Skip to content</a>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Sidebar">
        <div className="brand"><Logo variant="white" to="/" /></div>
        <nav className="side-nav" aria-label="Primary">
          {items.map((n) => (n.group
            ? <div key={n.group} className="group">{n.group}</div>
            : <NavLink key={n.to} to={n.to} end={n.end}><span className="ico" aria-hidden="true">{n.icon}</span>{n.label}</NavLink>))}
        </nav>
        <div className="side-user">
          <strong>{user.fullName}</strong>
          <span>{ROLE_LABELS[user.role]}</span>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>☰</button>
          <span className="muted small hide-sm">Welcome back, <b>{user.fullName.split(' ')[0]}</b></span>
          <div className="actions">
            <button className="icon-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? '☀' : '☾'}</button>
            <NavLink to="/app/notifications" className="icon-btn" aria-label={`Notifications, ${unread} unread`}>🔔{unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}</NavLink>
            <NavLink to="/app/profile" className="btn btn-outline btn-sm">Profile</NavLink>
            <button className="btn btn-navy btn-sm" onClick={async () => { await logout(); nav('/'); }}>Log out</button>
          </div>
        </header>
        <main id="content" className="content"><Outlet /></main>
      </div>
    </div>
  );
}
