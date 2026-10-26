import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFetch } from '../hooks.js';
import { useAuth } from '../context/AuthContext.jsx';
import { EmptyState, ErrorBox, PageHeader, Spinner, Stat, StatusBadge } from '../components/ui.jsx';
import { date, dateTime, money, number, ROLE_LABELS } from '../utils/format.js';

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch('/dashboard');
  if (loading) return <Spinner text="Loading your dashboard..." />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  const { projects, tasks, budgets, deadlines, activity, extra, unreadNotifications } = data;
  const chart = budgets.map((b) => ({ name: b.title.length > 16 ? `${b.title.slice(0, 15)}…` : b.title, Budget: Number(b.budget), Spent: Number(b.spent) }));

  return (
    <>
      <PageHeader title={`Hello, ${user.fullName.split(' ')[0]}`} subtitle={`${ROLE_LABELS[user.role]} dashboard - you only see data you are allowed to access.`} />
      <div className="grid cols-3" style={{ marginBottom: 22 }}>
        <Stat icon="🏗" value={number(projects.active)} label="Active projects" tone="orange" />
        <Stat icon="✅" value={number(projects.completed)} label="Completed projects" tone="green" />
        <Stat icon="📝" value={number(tasks.pending)} label="Pending tasks" />
        <Stat icon="⏰" value={number(tasks.overdue)} label="Overdue tasks" tone="red" />
        <Stat icon="🔔" value={number(unreadNotifications)} label="Unread notifications" />
        {extra.openRequests !== undefined && <Stat icon="🧾" value={number(extra.openRequests)} label="Open quotation requests" tone="orange" />}
        {extra.activeQuotations !== undefined && <Stat icon="📨" value={number(extra.activeQuotations)} label="Quotations awaiting decision" tone="orange" />}
        {extra.lowStock !== undefined && <Stat icon="📦" value={number(extra.lowStock)} label="Low-stock materials" tone={extra.lowStock ? 'red' : 'green'} />}
      </div>

      <div className="grid cols-2">
        <section className="card" aria-labelledby="bva">
          <h2 id="bva" style={{ fontSize: '1.1rem' }}>Budget vs actual spending</h2>
          {chart.length === 0 ? <EmptyState icon="📊" title="No projects yet">Budgets appear here once you have projects.</EmptyState> : (
            <div className="chart-box" role="img" aria-label="Bar chart comparing budget and approved spending per project">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,130,150,.3)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'currentColor' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} tickFormatter={(v) => (v >= 1e6 ? `${v / 1e6}M` : v >= 1e3 ? `${v / 1e3}k` : v)} />
                  <Tooltip formatter={(v) => money(v)} />
                  <Legend />
                  <Bar dataKey="Budget" fill="#2f6db5" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Spent" fill="#ff6a00" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="dl">
          <h2 id="dl" style={{ fontSize: '1.1rem' }}>Upcoming deadlines (14 days)</h2>
          {deadlines.length === 0 ? <EmptyState icon="🎉" title="Nothing due soon">No open tasks are due in the next two weeks.</EmptyState> : (
            <ul className="list">
              {deadlines.map((d) => (
                <li key={d.id}>
                  <div><b>{d.title}</b><div className="muted small"><Link className="link" to={`/app/projects/${d.projectId}`}>{d.projectTitle}</Link></div></div>
                  <div style={{ textAlign: 'right' }}><div className="small">{date(d.dueDate)}</div><StatusBadge status={d.priority} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="act" style={{ gridColumn: '1 / -1' }}>
          <h2 id="act" style={{ fontSize: '1.1rem' }}>Recent activity</h2>
          {activity.length === 0 ? <EmptyState icon="🕘" title="No activity yet">Updates from your projects will show up here.</EmptyState> : (
            <ul className="list">{activity.map((a, i) => <li key={i}><span>{a.text}</span><span className="muted small">{dateTime(a.at)}</span></li>)}</ul>
          )}
        </section>
      </div>
    </>
  );
}
