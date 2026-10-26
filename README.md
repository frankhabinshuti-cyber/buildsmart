# BuildSmart — All-in-One Construction Management Platform

React (Vite) frontend · Node/Express REST API · MySQL. Brand colors: navy `#0B2A4A`, orange `#FF6A00`.

## What works today

| Area | Status |
|---|---|
| Registration, login/logout, password reset, profile, change password | Working. Passwords hashed (bcrypt), JWT sessions, lockout after repeated failures, rate limiting |
| Role-based access (7 roles) | Working, enforced **on the server** (and covered by tests) |
| Dashboard (counts, budget vs actual chart, deadlines, activity) | Working, scoped to what each role may see |
| Projects: create/edit/archive, milestones, team, progress history, search/filter/sort/paging | Working |
| Tasks: assign, priority, due dates, dependencies, overdue flag, status history | Working |
| Budget & expenses: record → manager approves → counts against budget; over-budget alerts | Working (all money maths done on the server in exact cents) |
| Materials & inventory: catalog, receive/allocate/adjust stock, history, low-stock alerts | Working (stock can never go negative) |
| Quotations: client request → itemised quotes → versions kept → accept/decline | Working |
| Marketplace: public search, services, reviews (one per client per service), company profile | Working |
| Notifications (in-app, read/unread), project messages | Working |
| Admin: users, roles, activate/deactivate, audit log | Working |
| Dark mode, mobile layout, keyboard-accessible forms and dialogs | Working |
| **Not built yet** | Invoices & payment records, document/plan uploads, report exports (CSV/PDF), e-mail notifications, deployment config |

Payments are intentionally not faked: when invoices/payments are added, a payment will only be marked paid after the issuer confirms it.

## Run it on Windows (Command Prompt)

You need: Node.js 20 or newer (`node -v`), MySQL Server **or** XAMPP's MySQL, Git (optional).

1. **Create the database and a user** (MySQL Workbench, or `mysql -u root -p`):
   ```sql
   CREATE DATABASE buildsmart CHARACTER SET utf8mb4;
   CREATE DATABASE buildsmart_test CHARACTER SET utf8mb4;
   CREATE USER 'buildsmart'@'localhost' IDENTIFIED BY 'choose_a_password';
   GRANT ALL ON buildsmart.* TO 'buildsmart'@'localhost';
   GRANT ALL ON buildsmart_test.* TO 'buildsmart'@'localhost';
   ```
2. **Backend** (folder `backend`):
   ```
   cd backend
   copy .env.example .env
   ```
   Open `.env`, put your DB password in `DB_PASSWORD`, and a long random `JWT_SECRET`
   (generate one: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).
   ```
   npm install
   npm run db:reset
   npm run dev
   ```
   Expected: `BuildSmart API running on http://localhost:4000/api/v1`
3. **Frontend** (second Command Prompt, folder `frontend`):
   ```
   cd frontend
   npm install
   npm run dev
   ```
   Open **http://localhost:5173**.

> `npm run db:reset` **deletes every table** and re-creates demo data. Use it only in development.

## Demo accounts (development only — created by the seed)

| Role | Email | Password |
|---|---|---|
| Super administrator | admin@buildsmart.rw | `Admin@12345` |
| Construction company | company@buildsmart.rw | `Demo@12345` |
| Project manager | manager@buildsmart.rw | `Demo@12345` |
| Client | client@buildsmart.rw | `Demo@12345` |
| Engineer / architect | engineer@buildsmart.rw | `Demo@12345` |
| Worker / contractor | worker@buildsmart.rw | `Demo@12345` |
| Supplier | supplier@buildsmart.rw | `Demo@12345` |

The login page shows one-click buttons for these in development. Change them before any real deployment.

## Manual test walk-through (in order)

Each step lists what you should see.

1. **Public site** — open `/`. *Expect:* BuildSmart logo (min. 120px wide) in the header, tagline "Smarter Tools. Better Projects. Stronger Communities.", Log in / Get started buttons. Open **Find professionals** — services list without logging in.
2. **Bad login** — log in with a wrong password. *Expect:* a red error message, no crash. After 5 failures the account locks for 15 minutes.
3. **Manager** (`manager@…`) — *Expect:* dashboard cards, budget chart, deadlines. Open **Projects → Kacyiru Family Home**:
   - **Overview:** add a milestone → it appears; report progress 60% → "Progress recorded" and the progress bar updates.
   - **Tasks:** "+ Add task" → task appears; change its status with the dropdown.
   - **Budget & expenses:** submit an expense (RWF 150000) → status *pending*; press **Approve** → "Spent" grows and "Remaining" shrinks.
4. **Materials** — **Update stock → Goods received, qty 10** → toast shows the new balance; **History** lists the movement. Try an allocation larger than the stock → clear error, stock unchanged.
5. **Client** (`client@…`) — **Quotations → + New request** → fill title/details → request page opens. *Expect:* no Materials/Admin items in the menu.
6. **Company** (`company@…`) — open that request, add an item (Qty 60 × Unit price 12500.50) → *Total RWF 750,030* (calculated by the server) → **Send quotation**. Send again → "version 2"; the earlier one stays under "earlier versions".
7. **Client** — open the request → **Accept quotation**. *Expect:* status accepted, other quotes declined.
8. **Company** — **🔔 Notifications** → "Your quotation was accepted".
9. **Admin** (`admin@…`) — **Users** (change a role, deactivate an account) and **Audit log** (see `quotation.accept` etc.). A manager who types `/app/admin/users` is sent back to the dashboard.
10. **Mobile** — narrow the browser to ~390px (F12 → device toolbar). *Expect:* ☰ menu, no sideways scrolling.

## Automated tests

```
cd backend
npm test
```
Runs against the separate `buildsmart_test` database (never your real data). Last run: **58 passed, 0 failed** — covers registration/login, expired and invalid tokens, role permissions, CRUD, project and budget calculations, inventory movements, quotation totals, validation and error handling.

## Folder map

```
backend/src
  routes/index.js        URL → controller wiring, role checks, validation
  controllers/           one file per module (auth, projects, tasks, expenses, materials, quotations, ...)
  services/              shared business rules (access, finance, inventory, quotation maths)
  middleware/            auth (JWT), validation, rate limits, central error handler
  db/                    pool, migrations (001, 002), seed
backend/tests            automated API tests
frontend/src
  pages/ components/     screens and reusable UI (tables, forms, modals, badges)
  context/ api/          login state, theme/toasts, API client
  public/images          logo variants cut from the brand poster (full colour, white, icon)
old-version/             snapshot of the earlier code + DB dump, kept as a safety copy
```

## Security notes

- Passwords hashed with bcrypt; secrets only in `.env` (never committed — see `.gitignore`).
- Every query is parameterised; inputs validated on the server with Zod; errors never reveal stack traces.
- Roles are re-read from the database on every request, so a deactivated or demoted user loses access immediately.
- Clients cannot choose their own role, price, status or ownership — the server decides those.
- Production checklist: HTTPS, strong `JWT_SECRET`, restricted `CLIENT_ORIGIN`, database backups, change the demo passwords or don't run the seed.

## Known limitations / next steps

Invoices and payment records, document uploads, CSV/PDF reports, e-mail notifications, frontend component tests, and deployment configuration are not built yet. `src/routes/auth.routes.js` and `src/routes/projects.routes.js` are unused leftovers from an earlier rewrite and can be deleted.
