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
  const client2 = await user('client2@buildsmart.rw', 'Diane Ingabire', 'client', demo, '+250788777777');
  const eng = await user('engineer@buildsmart.rw', 'Eric Nshuti', 'engineer_architect', demo, '+250788444444');
  const worker = await user('worker@buildsmart.rw', 'Patrick Habimana', 'worker', demo, '+250788555555');
  const supplierUser = await user('supplier@buildsmart.rw', 'Rwanda Cement Supply', 'supplier', demo, '+250788666666');

  await query('INSERT IGNORE INTO companies (owner_id, name, description, location, phone, is_verified) VALUES (?,?,?,?,?,1)',
    [comp, 'Kigali Builders Ltd', 'Residential and commercial construction, renovation and roofing across Kigali and Musanze.', 'Kigali', '+250788111111']);
  const [company] = await query('SELECT id FROM companies WHERE owner_id = ?', [comp]);
  const cats = Object.fromEntries((await query('SELECT id, name FROM service_categories')).map((c) => [c.name, c.id]));
  const [{ n }] = await query('SELECT COUNT(*) n FROM services WHERE company_id = ?', [company.id]);
  if (n === 0) {
    await query('INSERT INTO services (company_id, provider_id, category_id, title, description, location, price_from) VALUES ?', [[
      [company.id, comp, cats.Construction, 'Residential house construction', 'Full build from foundation to finishing.', 'Kigali', 25000000],
      [company.id, comp, cats.Roofing, 'Roofing and waterproofing', 'Iron sheet and tile roofing with 5-year workmanship warranty.', 'Kigali', 1800000],
      [company.id, comp, cats.Renovation, 'Apartment renovation', 'Interior remodelling, tiling and painting.', 'Kigali', 3500000],
      [null, eng, cats.Architecture, 'Architectural design and permit drawings', 'Concept design, working drawings and building-permit submission.', 'Kigali', 1200000],
      [null, eng, cats.Engineering, 'Structural engineering review', 'Independent structural calculations and site inspections.', 'Kigali', 800000],
      [null, supplierUser, cats.Construction, 'Bulk cement and aggregate delivery', 'Same-day delivery of cement, sand and gravel in Kigali.', 'Kigali', 16000],
    ]]);
  }

  const [{ p }] = await query('SELECT COUNT(*) p FROM projects');
  if (p === 0) {
    const ins = async (title, loc, status, progress, est, appr, start, end, cat, clientId = client) => {
      const r = await query(
        'INSERT INTO projects (title, description, location, category_id, client_id, company_id, manager_id, created_by, start_date, end_date, estimated_budget, approved_budget, status, progress) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [title, `${title} - managed on BuildSmart.`, loc, cats[cat], clientId, company.id, pm, comp, start, end, est, appr, status, progress]);
      await query('INSERT INTO project_members (project_id, user_id) VALUES ?', [[[r.insertId, eng], [r.insertId, worker], [r.insertId, clientId], [r.insertId, pm]]]);
      return r.insertId;
    };
    const p1 = await ins('Kacyiru Family Home', 'Kacyiru, Kigali', 'active', 45, 42000000, 40000000, '2026-08-01', '2027-03-30', 'Construction');
    const p2 = await ins('Nyarutarama Apartment Renovation', 'Nyarutarama, Kigali', 'active', 70, 9000000, 8500000, '2026-09-01', '2026-12-15', 'Renovation');
    await ins('Musanze Guest House Roofing', 'Musanze', 'planning', 0, 6500000, 6000000, '2026-11-15', '2027-01-30', 'Roofing');
    const p5 = await ins('Kimironko Office Renovation', 'Kimironko, Kigali', 'active', 30, 12000000, 11000000, '2026-09-15', '2027-01-20', 'Renovation', client2);
    await query('INSERT INTO tasks (project_id, title, assignee_id, priority, status, start_date, due_date, created_by) VALUES (?,?,?,?,?,?,?,?)',
      [p5, 'Demolish partition walls', worker, 'medium', 'in_progress', '2026-10-01', '2026-10-30', pm]);
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
      [p1, 'labor', 'Foundation crew - 3 weeks', 4800000, '2026-09-20', 'approved', pm, comp],
      [p1, 'equipment', 'Concrete mixer hire', 900000, '2026-10-02', 'approved', pm, comp],
      [p1, 'transport', 'Sand and gravel delivery', 650000, '2026-10-06', 'pending', pm, null],
      [p2, 'material', 'Floor tiles 120 m2', 2400000, '2026-09-18', 'approved', pm, comp],
      [p2, 'labor', 'Tilers', 1500000, '2026-10-03', 'approved', pm, comp],
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
      [qr.insertId, 'material', 'Blocks, cement and rebar', 60, 70000, 4200000], [qr.insertId, 'labor', 'Masons and helpers', 60, 30000, 1800000], [qr.insertId, 'equipment', 'Gate fabrication', 1, 400000, 400000],
    ]]);
  }

  const [{ m }] = await query('SELECT COUNT(*) m FROM messages');
  if (m === 0) {
    const [p1] = await query("SELECT id FROM projects WHERE title = 'Kacyiru Family Home'");
    await query('INSERT INTO messages (project_id, user_id, body) VALUES ?', [[
      [p1.id, client, 'Good morning team, when can I visit the site to see the slab?'],
      [p1.id, pm, 'Good morning! Friday 10:00 works - we will have the slab formwork ready for you to see.'],
      [p1.id, eng, 'Rebar inspection passed. Concrete pour is scheduled for next week.'],
    ]]);
  }
  const [{ rv }] = await query('SELECT COUNT(*) rv FROM reviews');
  if (rv === 0) {
    const [svc] = await query('SELECT id, company_id FROM services ORDER BY id LIMIT 2');
    await query('INSERT INTO reviews (company_id, service_id, client_id, rating, comment) VALUES ?', [[
      [svc.company_id, svc.id, client, 5, 'Professional team and honest pricing. Finished our wall on time.'],
    ]]);
  }
  const [{ im }] = await query('SELECT COUNT(*) im FROM inventory_movements');
  if (im === 0) {
    const mats = await query('SELECT id, stock_qty, unit_cost FROM materials ORDER BY id');
    for (const mat of mats) {
      await query("INSERT INTO inventory_movements (material_id, movement_type, quantity, balance_after, unit_cost, note, user_id) VALUES (?, 'in', ?, ?, ?, 'Opening stock', ?)",
        [mat.id, mat.stock_qty, mat.stock_qty, mat.unit_cost, pm]);
    }
  }
  const [{ nn }] = await query('SELECT COUNT(*) nn FROM notifications');
  if (nn === 0) {
    await query('INSERT INTO notifications (user_id, type, title, body, link) VALUES ?', [[
      [pm, 'expense', 'Expense awaiting approval', 'Sand and gravel delivery - 650000', '/app/projects'],
      [worker, 'task', 'New task assigned', 'Order roofing timber (Kacyiru Family Home)', '/app/tasks'],
      [client, 'progress', 'Progress update: Kacyiru Family Home', '45% complete', '/app/projects'],
    ]]);
  }
  console.log('Seed complete.');
}

/** Base data (roles, categories) plus demo data. Used by `npm run db:seed` and by the tests. */
export async function seed({ log = console.log } = {}) {
  await seedBase();
  await seedDemo();
  void log;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedBase().then(seedDemo).then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
