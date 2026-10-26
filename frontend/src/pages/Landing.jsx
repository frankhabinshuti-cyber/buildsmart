import { Link } from 'react-router-dom';

const FEATURES = [
  ['🏗', 'Project management', 'Plan projects, milestones, teams and deadlines in one place, with progress your clients can follow.'],
  ['✔', 'Tasks and schedules', 'Assign tasks, set dependencies and spot overdue work before it delays the site.'],
  ['💰', 'Budgets and expenses', 'Compare budget against approved spending, with approvals so nobody signs off their own costs.'],
  ['📦', 'Materials and inventory', 'Track stock, reorder levels and allocations to projects with a full movement history.'],
  ['🧾', 'Quotations', 'Clients request, professionals quote line by line, and the best offer is accepted in one click.'],
  ['🔎', 'Professional marketplace', 'Find builders, engineers, architects and suppliers by service, location and reviews.'],
];
const ROLES = [
  ['🏢', 'Construction companies'], ['📋', 'Project managers'], ['🏠', 'Clients'],
  ['📐', 'Engineers and architects'], ['👷', 'Workers and contractors'], ['🚚', 'Suppliers'],
];
const STEPS = [
  ['1', 'Create your account', 'Choose your role. Each role sees only what it needs.'],
  ['2', 'Plan and connect', 'Set up projects, invite your team and request or send quotations.'],
  ['3', 'Build and track', 'Follow tasks, stock, spending and progress from any device.'],
];

export default function Landing() {
  return (
    <>
      <section className="hero">
        <div className="inner">
          <div className="hero-tag"><span>Smarter Tools.</span><span style={{ color: '#fff' }}>Better Projects.</span><span>Stronger Communities.</span></div>
          <h1>Build smart. <em>Deliver on time.</em></h1>
          <p>BuildSmart connects clients, construction companies, engineers, contractors and suppliers on one secure platform made for the Rwandan construction industry.</p>
          <div className="row">
            <Link to="/register" className="btn btn-primary btn-lg">Create free account</Link>
            <Link to="/marketplace" className="btn btn-lg" style={{ background: 'rgba(255,255,255,.12)', color: '#fff', border: '2px solid rgba(255,255,255,.35)' }}>Find professionals</Link>
          </div>
        </div>
      </section>

      <section className="section" id="features">
        <div className="container">
          <div className="section-title">
            <div className="eyebrow">Everything on one platform</div>
            <h2 style={{ fontSize: '1.9rem' }}>Tools that keep every project on track</h2>
            <p className="muted">From the first quotation to the final handover, BuildSmart keeps your team, money and materials in sync.</p>
          </div>
          <div className="grid cols-3">
            {FEATURES.map(([icon, title, text]) => (
              <article className="card feature" key={title}>
                <div className="icon" aria-hidden="true">{icon}</div>
                <h3>{title}</h3>
                <p className="muted" style={{ margin: 0 }}>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section alt">
        <div className="container">
          <div className="section-title"><div className="eyebrow">How it works</div><h2 style={{ fontSize: '1.9rem' }}>Up and running in three steps</h2></div>
          <div className="grid cols-3">
            {STEPS.map(([n, t, d]) => (
              <div key={n} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <span className="stat-icon orange" style={{ fontWeight: 800 }}>{n}</span>
                <div><h3 style={{ marginBottom: 4 }}>{t}</h3><p className="muted" style={{ margin: 0 }}>{d}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-title"><div className="eyebrow">Built for everyone on site</div><h2 style={{ fontSize: '1.9rem' }}>One platform, the right view for each role</h2></div>
          <div className="grid cols-3">
            {ROLES.map(([i, r]) => <div className="role-chip" key={r}><span aria-hidden="true">{i}</span><span>{r}</span></div>)}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="cta">
            <div><h2>Ready to build smarter?</h2><p>Join clients and construction professionals already planning projects on BuildSmart.</p></div>
            <Link to="/register" className="btn btn-primary btn-lg">Get started</Link>
          </div>
        </div>
      </section>
    </>
  );
}
