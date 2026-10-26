const nf = new Intl.NumberFormat('en-RW', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** Amounts are Rwandan francs by default. Values arrive from the API as strings. */
export const money = (v, currency = 'RWF') => (v === null || v === undefined || v === '' ? '-' : `${currency} ${nf.format(Number(v))}`);
export const number = (v) => (v === null || v === undefined ? '-' : nf.format(Number(v)));

export function date(v) {
  if (!v) return '-';
  const d = new Date(String(v).length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function dateTime(v) {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export const label = (s) => (s ? String(s).replace(/_/g, ' ') : '');
export const today = () => new Date().toISOString().slice(0, 10);

export const ROLE_LABELS = {
  super_admin: 'Super Administrator', company: 'Construction Company', project_manager: 'Project Manager',
  client: 'Client', engineer: 'Engineer / Architect', worker: 'Worker / Contractor', supplier: 'Supplier',
};

/** Color for a status badge. */
export function tone(status) {
  const s = String(status);
  if (['completed', 'done', 'approved', 'accepted', 'active', 'received', 'open', 'success'].includes(s)) return 'green';
  if (['cancelled', 'rejected', 'blocked', 'expired', 'urgent', 'high', 'overdue'].includes(s)) return 'red';
  if (['pending', 'on_hold', 'planning', 'in_progress', 'medium', 'submitted', 'awarded', 'todo'].includes(s)) return s === 'todo' ? 'blue' : 'orange';
  return '';
}
