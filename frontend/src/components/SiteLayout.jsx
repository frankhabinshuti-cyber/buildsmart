import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import Logo from './Logo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUi } from '../context/UiContext.jsx';

export default function SiteLayout() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const { theme, toggleTheme } = useUi();
  const close = () => setOpen(false);
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="site-header">
        <div className="container inner">
          <Logo />
          <button className="icon-btn nav-toggle" aria-label="Toggle menu" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen(!open)}>{open ? '✕' : '☰'}</button>
          <nav id="site-nav" className={`nav ${open ? 'open' : ''}`} aria-label="Main">
            <NavLink to="/" end onClick={close}>Home</NavLink>
            <NavLink to="/marketplace" onClick={close}>Find professionals</NavLink>
            <a href="/#features" onClick={close}>Features</a>
            <button className="icon-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? '☀' : '☾'}</button>
            {user ? (
              <Link to="/app" className="btn btn-primary btn-sm" onClick={close}>Open dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-outline btn-sm" onClick={close}>Log in</Link>
                <Link to="/register" className="btn btn-primary btn-sm" onClick={close}>Get started</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="main"><Outlet /></main>
      <footer className="site-footer">
        <div className="container">
          <div className="cols">
            <Logo variant="white" />
            <div className="motto"><span>Build Smart</span><span>Work Smart</span><span>Grow Together</span></div>
          </div>
          <p className="small" style={{ marginTop: 22, marginBottom: 0 }}>© {new Date().getFullYear()} BuildSmart. Building the future, intelligently.</p>
        </div>
      </footer>
    </>
  );
}
