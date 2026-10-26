-- BuildSmart schema. Money = DECIMAL(14,2). Quantities = DECIMAL(14,3). Engine = InnoDB (foreign keys).
-- Deletion policy: business records are ARCHIVED (archived_at) or kept for history, not hard-deleted.

CREATE TABLE roles (
  id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(60) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_id TINYINT UNSIGNED NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone VARCHAR(30) NULL,
  password_hash VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  failed_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id),
  INDEX idx_users_role (role_id)
) ENGINE=InnoDB;

CREATE TABLE password_resets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_pr_token (token_hash)
) ENGINE=InnoDB;

CREATE TABLE companies (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id INT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  location VARCHAR(150) NULL,
  phone VARCHAR(30) NULL,
  email VARCHAR(190) NULL,
  website VARCHAR(190) NULL,
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_company_owner FOREIGN KEY (owner_id) REFERENCES users(id),
  UNIQUE KEY uq_company_owner (owner_id),
  INDEX idx_company_location (location)
) ENGINE=InnoDB;

CREATE TABLE service_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  slug VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE services (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_id INT UNSIGNED NOT NULL,
  company_id INT UNSIGNED NULL,
  category_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  location VARCHAR(150) NULL,
  price_from DECIMAL(14,2) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_service_provider FOREIGN KEY (provider_id) REFERENCES users(id),
  CONSTRAINT fk_service_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  CONSTRAINT fk_service_category FOREIGN KEY (category_id) REFERENCES service_categories(id),
  INDEX idx_service_category (category_id),
  INDEX idx_service_location (location)
) ENGINE=InnoDB;

CREATE TABLE reviews (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  reviewer_id INT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_review_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_review_user FOREIGN KEY (reviewer_id) REFERENCES users(id),
  CONSTRAINT ck_review_rating CHECK (rating BETWEEN 1 AND 5),
  UNIQUE KEY uq_one_review_per_user (company_id, reviewer_id) -- abuse prevention: one review each
) ENGINE=InnoDB;

CREATE TABLE projects (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  description TEXT NULL,
  location VARCHAR(150) NULL,
  category_id INT UNSIGNED NULL,
  client_id INT UNSIGNED NULL,
  company_id INT UNSIGNED NULL,
  manager_id INT UNSIGNED NULL,
  created_by INT UNSIGNED NOT NULL,
  planned_start DATE NULL,
  planned_end DATE NULL,
  estimated_budget DECIMAL(14,2) NOT NULL DEFAULT 0,
  approved_budget DECIMAL(14,2) NOT NULL DEFAULT 0,
  status ENUM('planning','active','on_hold','completed','cancelled') NOT NULL DEFAULT 'planning',
  completion_percent TINYINT UNSIGNED NOT NULL DEFAULT 0,
  archived_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_proj_category FOREIGN KEY (category_id) REFERENCES service_categories(id),
  CONSTRAINT fk_proj_client FOREIGN KEY (client_id) REFERENCES users(id),
  CONSTRAINT fk_proj_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_proj_manager FOREIGN KEY (manager_id) REFERENCES users(id),
  CONSTRAINT fk_proj_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT ck_proj_dates CHECK (planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start),
  CONSTRAINT ck_proj_percent CHECK (completion_percent <= 100),
  CONSTRAINT ck_proj_budget CHECK (estimated_budget >= 0 AND approved_budget >= 0),
  INDEX idx_proj_status (status),
  INDEX idx_proj_manager (manager_id),
  INDEX idx_proj_client (client_id),
  INDEX idx_proj_company (company_id)
) ENGINE=InnoDB;

CREATE TABLE project_members (
  project_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  role_label VARCHAR(60) NULL,
  added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, user_id),
  CONSTRAINT fk_pm_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE project_milestones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  due_date DATE NULL,
  status ENUM('pending','done') NOT NULL DEFAULT 'pending',
  completed_at DATETIME NULL,
  CONSTRAINT fk_ms_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_ms_project (project_id)
) ENGINE=InnoDB;

CREATE TABLE project_progress_updates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  completion_percent TINYINT UNSIGNED NOT NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pp_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_pp_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_pp_project (project_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE tasks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  title VARCHAR(160) NOT NULL,
  description TEXT NULL,
  priority ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  status ENUM('todo','in_progress','blocked','done') NOT NULL DEFAULT 'todo',
  assignee_id INT UNSIGNED NULL,
  depends_on_task_id INT UNSIGNED NULL,
  start_date DATE NULL,
  due_date DATE NULL,
  completed_at DATETIME NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_task_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_assignee FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_task_dep FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  CONSTRAINT fk_task_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT ck_task_dates CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date),
  INDEX idx_task_project (project_id),
  INDEX idx_task_assignee (assignee_id),
  INDEX idx_task_due (due_date)
) ENGINE=InnoDB;

CREATE TABLE task_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NOT NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_th_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_th_task (task_id)
) ENGINE=InnoDB;

CREATE TABLE suppliers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  name VARCHAR(150) NOT NULL,
  contact_name VARCHAR(120) NULL,
  phone VARCHAR(30) NULL,
  email VARCHAR(190) NULL,
  location VARCHAR(150) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_supplier_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE materials (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT UNSIGNED NULL,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(80) NULL,
  unit VARCHAR(20) NOT NULL,
  description VARCHAR(500) NULL,
  unit_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  stock_quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
  reorder_level DECIMAL(14,3) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_material_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  CONSTRAINT ck_material_stock CHECK (stock_quantity >= 0), -- stock can never go negative
  CONSTRAINT ck_material_cost CHECK (unit_cost >= 0),
  INDEX idx_material_name (name)
) ENGINE=InnoDB;

CREATE TABLE inventory_movements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  material_id INT UNSIGNED NOT NULL,
  project_id INT UNSIGNED NULL,
  movement_type ENUM('receive','issue','return','adjust') NOT NULL,
  quantity_change DECIMAL(14,3) NOT NULL,
  balance_after DECIMAL(14,3) NOT NULL,
  unit_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  note VARCHAR(300) NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_im_material FOREIGN KEY (material_id) REFERENCES materials(id),
  CONSTRAINT fk_im_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  CONSTRAINT fk_im_user FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_im_material (material_id, created_at),
  INDEX idx_im_project (project_id)
) ENGINE=InnoDB;

CREATE TABLE quotation_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id INT UNSIGNED NOT NULL,
  project_id INT UNSIGNED NULL,
  target_company_id INT UNSIGNED NULL,
  category_id INT UNSIGNED NULL,
  title VARCHAR(160) NOT NULL,
  description TEXT NULL,
  location VARCHAR(150) NULL,
  budget_hint DECIMAL(14,2) NULL,
  needed_by DATE NULL,
  status ENUM('open','awarded','closed') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_qr_client FOREIGN KEY (client_id) REFERENCES users(id),
  CONSTRAINT fk_qr_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  CONSTRAINT fk_qr_company FOREIGN KEY (target_company_id) REFERENCES companies(id) ON DELETE SET NULL,
  CONSTRAINT fk_qr_category FOREIGN KEY (category_id) REFERENCES service_categories(id),
  INDEX idx_qr_status (status),
  INDEX idx_qr_client (client_id)
) ENGINE=InnoDB;

CREATE TABLE quotations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id INT UNSIGNED NOT NULL,
  provider_id INT UNSIGNED NOT NULL,
  company_id INT UNSIGNED NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  subtotal DECIMAL(14,2) NOT NULL,
  tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL,
  valid_until DATE NULL,
  status ENUM('submitted','accepted','rejected','expired','superseded') NOT NULL DEFAULT 'submitted',
  notes VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_q_request FOREIGN KEY (request_id) REFERENCES quotation_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_q_provider FOREIGN KEY (provider_id) REFERENCES users(id),
  CONSTRAINT fk_q_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  UNIQUE KEY uq_quote_version (request_id, provider_id, version), -- keeps history of revisions
  INDEX idx_q_status (status)
) ENGINE=InnoDB;

CREATE TABLE quotation_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quotation_id INT UNSIGNED NOT NULL,
  item_type ENUM('material','labor','equipment','transport','other') NOT NULL DEFAULT 'material',
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(14,3) NOT NULL,
  unit VARCHAR(20) NULL,
  unit_price DECIMAL(14,2) NOT NULL,
  line_total DECIMAL(14,2) NOT NULL,
  CONSTRAINT fk_qi_quote FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
  CONSTRAINT ck_qi_qty CHECK (quantity > 0),
  INDEX idx_qi_quote (quotation_id)
) ENGINE=InnoDB;

CREATE TABLE contracts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quotation_id INT UNSIGNED NOT NULL UNIQUE,
  project_id INT UNSIGNED NULL,
  client_id INT UNSIGNED NOT NULL,
  provider_id INT UNSIGNED NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  status ENUM('active','completed','terminated') NOT NULL DEFAULT 'active',
  signed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_c_quote FOREIGN KEY (quotation_id) REFERENCES quotations(id),
  CONSTRAINT fk_c_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  CONSTRAINT fk_c_client FOREIGN KEY (client_id) REFERENCES users(id),
  CONSTRAINT fk_c_provider FOREIGN KEY (provider_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE expenses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  category ENUM('labor','material','equipment','transport','other') NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  expense_date DATE NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  submitted_by INT UNSIGNED NOT NULL,
  reviewed_by INT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_exp_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_exp_submitter FOREIGN KEY (submitted_by) REFERENCES users(id),
  CONSTRAINT fk_exp_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id),
  CONSTRAINT ck_exp_amount CHECK (amount > 0),
  INDEX idx_exp_project (project_id, status)
) ENGINE=InnoDB;

CREATE TABLE invoices (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(30) NOT NULL UNIQUE,
  project_id INT UNSIGNED NOT NULL,
  client_id INT UNSIGNED NOT NULL,
  issued_by INT UNSIGNED NOT NULL,
  subtotal DECIMAL(14,2) NOT NULL,
  tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL,
  due_date DATE NULL,
  status ENUM('draft','sent','partially_paid','paid','cancelled') NOT NULL DEFAULT 'sent',
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_inv_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_inv_client FOREIGN KEY (client_id) REFERENCES users(id),
  CONSTRAINT fk_inv_issuer FOREIGN KEY (issued_by) REFERENCES users(id),
  INDEX idx_inv_project (project_id),
  INDEX idx_inv_client (client_id)
) ENGINE=InnoDB;

CREATE TABLE invoice_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT UNSIGNED NOT NULL,
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(14,3) NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL,
  line_total DECIMAL(14,2) NOT NULL,
  CONSTRAINT fk_ii_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- A payment is only a RECORD until the invoice issuer confirms the money was received.
-- No card numbers or provider secrets are ever stored here.
CREATE TABLE payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT UNSIGNED NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  method ENUM('mobile_money','bank_transfer','cash','other') NOT NULL,
  reference VARCHAR(80) NULL,
  status ENUM('pending','confirmed','rejected') NOT NULL DEFAULT 'pending',
  recorded_by INT UNSIGNED NOT NULL,
  confirmed_by INT UNSIGNED NULL,
  confirmed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pay_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  CONSTRAINT fk_pay_recorder FOREIGN KEY (recorded_by) REFERENCES users(id),
  CONSTRAINT fk_pay_confirmer FOREIGN KEY (confirmed_by) REFERENCES users(id),
  CONSTRAINT ck_pay_amount CHECK (amount > 0),
  INDEX idx_pay_invoice (invoice_id)
) ENGINE=InnoDB;

CREATE TABLE documents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  uploaded_by INT UNSIGNED NOT NULL,
  title VARCHAR(160) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(80) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('draft','pending_approval','approved','rejected') NOT NULL DEFAULT 'pending_approval',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_doc_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_user FOREIGN KEY (uploaded_by) REFERENCES users(id),
  INDEX idx_doc_project (project_id)
) ENGINE=InnoDB;

CREATE TABLE messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  body VARCHAR(2000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_msg_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_msg_project (project_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(160) NOT NULL,
  body VARCHAR(500) NULL,
  link VARCHAR(200) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notif_user (user_id, is_read, created_at)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(40) NULL,
  entity_id INT UNSIGNED NULL,
  details VARCHAR(1000) NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_action (action),
  INDEX idx_audit_user (user_id)
) ENGINE=InnoDB;

CREATE TABLE system_settings (
  setting_key VARCHAR(60) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
