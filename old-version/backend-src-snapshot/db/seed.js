import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool, query } from './pool.js';

const ROLES = [
  ['super_admin', 'Super Administrator'], ['company', 'Construction Company'], ['project_manager', 'Project Manager'],
  ['client', 'Client'], ['engineer_architect', 'Engineer / Architect'], ['worker', 'Worker / Contractor'], ['supplier', 'Supplier'],
];
const CATEGORIES = ['Construction', 'Renovation', 'Plumbing', 'Electrical', 'Painting', 'Roofing', 'Architecture', 'Engineering'];

export async function seedBase() {
  for (const [code, label] of ROLES) await query('INSERT IGNORE INTO roles (code, label) VALUES (?, ?)', [code, label]);
  for (const c of CATEGORIES) await query('INSERT IGNORE INTO service_categories (name) VALUES (?)', [c]);
}

async function user(email, name, role, pass, phone) {
  const [r] = await query('SELECT id FROM roles WHERE code = ?', [role]);
  const hash = await bcrypt.hash(pass, 10);
  await query('INSERT IGNORE INTO users (role_id, full_name, email, phone, password_hash) VALUES (?,?,?,?,?)', [r.id, name, email, phone, hash]);
  const [u] = await query('SELECT id FROM users WHERE email = ?', [email]);
  return u.id;
}

export async function seedDemo() {
  const adminPass = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
  const demo = process.env.SEED_DEMO_PASSWORD || 'Demo@12345';
  const admin = await user('admin@buildsmart.rw', 'Platform Admin', 'super_admin', adminPass, '+250788000000');
  const comp = await user('company@buildsmart.rw', 'Kigali Builders Ltd', 'company', demo, '+250788111111');
  const pm = await user('manager@buildsmart.rw', 'Aline Uwase', 'project_manager', demo, '+250788222222');
  const client = await user('client@buildsmart.rw', 'Jean Claude Mugisha', 'client', demo, '+250788333333');
  const eng = await user('engineer@buildsmart.rw', 'Eric Nshuti', 'engineer_architect', demo, '+250788444444');
  const worker = await user('worker@buildsmart.rw', 'Patrick Habimana', 'worker', demo, '+250788555555');
  const supplierUser = await user('supplier@buildsmart.rw', 'Rwanda Cement Supply', 'supplier', demo, '+250788666666');

  await query('INSERT IGNORE INTO companies (owner_id, name, description, location, phone, is_verified) VALUES (?,?,?,?,?,1)',
    [comp, 'Kigali Builders Ltd', 'Residential and commercial construction, renovation and roofing across Kigali and Musanze.', 'Kigali', '+250788111111']);
  const [company] = await query('SELECT id FROM companies WHERE owner_id = ?', [comp]);
  const cats = Object.fromEntries((await query('SELECT id, name FROM service_categories')).map((c) => [c.name, c.id]));
  const [{ n }] = await query('SELECT COUNT(*) n FROM services WHERE company_id = ?', [company.id]);
  if (n === 0) {
    await query('INSERT INTO services (company_id, category_id, title, description, price_from) VALUES ?', [[
      [company.id, cats.Construction, 'Residential house construction', 'Full build from foundation to finishing.', 25000000],
      [company.id, cats.Roofing, 'Roofing and waterproofing', 'Iron sheet and tile roofing with 5-year workmanship warranty.', 1800000],
      [company.id, cats.Renovation, 'Apartment renovation', 'Interior remodelling, tiling and painting.', 3500000],
    ]]);
  }

  const [{ p }] = await query('SELECT COUNT(*) p FROM projects');
  if (p === 0) {
    const ins = async (title, loc, status, progress, est, appr, start, end, cat) => {
      const r = await query(
        'INSERT INTO projects (title, description, location, category_id, client_id, company_id, manager_id, created_by, start_date, end_date, estimated_budget, approved_budget, status, progress) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [title, `${title} - managed on BuildSmart.`, loc, cats[cat], client, company.id, pm, client, start, end, est, appr, status, progress]);
      await query('INSERT INTO project_members (project_id, user_id) VALUES ?', [[[r.insertId, eng], [r.insertId, worker]]]);
      return r.insertId;
    };
    const p1 = await ins('Kacyiru Family Home', 'Kacyiru, Kigali', 'active', 45, 42000000, 40000000, '2026-08-01', '2027-03-30', 'Construction');
    const p2 = await ins('Nyarutarama Apartment Renovation', 'Nyarutarama, Kigali', 'active', 70, 9000000, 8500000, '2026-09-01', '2026-12-15', 'Renovation');
    await ins('Musanze Guest House Roofing', 'Musanze', 'planning', 0, 6500000, 6000000, '2026-11-15', '2027-01-30', 'Roofing');
    await ins('Remera Office Block', 'Remera, Kigali', 'completed', 100, 80000000, 78000000, '2025-10-01', '2026-08-30', 'Construction');
    await query('INSERT INTO tasks (project_id, title, assignee_id, priority, status, start_date, due_date, created_by) VALUES ?', [[
      [p1, 'Pour ground floor slab', worker, 'high', 'in_progress', '2026-10-05', '2026-10-25', pm],
      [p1, 'Structural drawings review', eng, 'urgent', 'todo', '2026-10-10', '2026-10-20', pm],
      [p1, 'Order roofing timber', worker, 'medium', 'todo', '2026-10-20', '2026-11-10', pm],
      [p1, 'Foundation inspection', eng, 'high', 'done', '2026-08-10', '2026-08-30', pm],
      [p2, 'Tile installation - living room', worker, 'medium', 'in_progress', '2026-10-01', '2026-10-12', pm],
      [p2, 'Electrical rewiring', worker, 'high', 'blocked', '2026-09-20', '2026-10-05', pm],
    ]]);
    await query('INSERT INTO project_milestones (project_id, title, due_date, is_done) VALUES ?', [[
      [p1, 'Foundation complete', '2026-09-01', 1], [p1, 'Slab and columns', '2026-11-30', 0], [p1, 'Roof structure', '2027-01-30', 0], [p2, 'Handover', '2026-12-15', 0],
    ]]);
    await query('INSERT INTO expenses (project_id, category, description, amount, expense_date, status, submitted_by, reviewed_by) VALUES ?', [[
      [p1, 'material', 'Cement 200 bags', 3200000, '2026-09-10', 'approved', pm, comp],
      [p1, 'labour', 'Foundation crew - 3 weeks', 4800000, '2026-09-20', 'approved', pm, comp],
      [p1, 'equipment', 'Concrete mixer hire', 900000, '2026-10-02', 'approved', pm, comp],
      [p1, 'transport', 'Sand and gravel delivery', 650000, '2026-10-06', 'pending', pm, null],
      [p2, 'material', 'Floor tiles 120 m2', 2400000, '2026-09-18', 'approved', pm, comp],
      [p2, 'labour', 'Tilers', 1500000, '2026-10-03', 'approved', pm, comp],
    ]]);
    await query('INSERT INTO project_progress_updates (project_id, user_id, progress, note) VALUES ?', [[
      [p1, pm, 25, 'Foundation finished and inspected.'], [p1, pm, 45, 'Ground floor columns in progress.'], [p2, pm, 70, 'Tiling nearly complete.'],
    ]]);
  }

  const [{ s }] = await query('SELECT COUNT(*) s FROM suppliers');
  if (s === 0) {
    const r = await query('INSERT INTO suppliers (user_id, name, contact_name, phone, email, location) VALUES (?,?,?,?,?,?)',
      [supplierUser, 'Rwanda Cement Supply', 'Sandrine Mukamana', '+250788666666', 'supplier@buildsmart.rw', 'Kigali']);
    await query('INSERT INTO materials (name, category, unit, supplier_id, unit_cost, stock_qty, reorder_level) VALUES ?', [[
      ['Portland Cement 50kg', 'Binders', 'bag', r.insertId, 16000, 350, 100],
      ['Rebar 12mm', 'Steel', 'piece', r.insertId, 9500, 80, 120],
      ['River Sand', 'Aggregates', 'm3', r.insertId, 22000, 40, 15],
      ['Clay Roof Tiles', 'Roofing', 'piece', r.insertId, 650, 2400, 500],
    ]]);
  }

  const [{ q }] = await query('SELECT COUNT(*) q FROM quotation_requests');
  if (q === 0) {
    const r = await query('INSERT INTO quotation_requests (client_id, title, description, category_id, location, budget_hint, deadline) VALUES (?,?,?,?,?,?,?)',
      [client, 'Boundary wall and gate', '60 m boundary wall, 2.4 m high, with sliding steel gate.', cats.Construction, 'Gisozi, Kigali', 7000000, '2026-11-30']);
    const qr = await query('INSERT INTO quotations (request_id, provider_id, total, notes, valid_until) VALUES (?,?,?,?,?)', [r.insertId, comp, 6400000, 'Price includes labour and materials.', '2026-11-20']);
    await query('INSERT INTO quotation_items (quotation_id, item_type, description, quantity, unit_price, line_total) VALUES ?', [[
      [qr.insertId, 'material', 'Blocks, cement and rebar', 60, 70000, 4200000], [qr.insertId, 'labour', 'Masons and helpers', 60, 30000, 1800000], [qr.insertId, 'equipment', 'Gate fabrication', 1, 400000, 400000],
    ]]);
  }
  console.log('Seed complete.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedBase().then(seedDemo).then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
