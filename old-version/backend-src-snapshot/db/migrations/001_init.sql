-- BuildSmart schema v1 (MySQL 8 / MariaDB 10.5+). Money = DECIMAL(14,2). Engine InnoDB for foreign keys.

CREATE TABLE roles (
  id TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(30) NOT NULL UNIQUE,
  label VARCHAR(60) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE users (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
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
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_pr_token (token_hash)
) ENGINE=InnoDB;

CREATE TABLE companies (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  owner_id INT UNSIGNED NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  location VARCHAR(120) NULL,
  phone VARCHAR(30) NULL,
  website VARCHAR(190) NULL,
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_company_owner FOREIGN KEY (owner_id) REFERENCES users(id),
  INDEX idx_company_location (location)
) ENGINE=InnoDB;

CREATE TABLE service_categories (
  id SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE services (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  company_id INT UNSIGNED NOT NULL,
  category_id SMALLINT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  price_from DECIMAL(14,2) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_service_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_service_cat FOREIGN KEY (category_id) REFERENCES service_categories(id),
  INDEX idx_service_cat (category_id)
) ENGINE=InnoDB;

CREATE TABLE projects (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  location VARCHAR(150) NULL,
  category_id SMALLINT UNSIGNED NULL,
  client_id INT UNSIGNED NULL,
  company_id INT UNSIGNED NULL,
  manager_id INT UNSIGNED NULL,
  created_by INT UNSIGNED NOT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  estimated_budget DECIMAL(14,2) NOT NULL DEFAULT 0,
  approved_budget DECIMAL(14,2) NOT NULL DEFAULT 0,
  status ENUM('planning','active','on_hold','completed','cancelled') NOT NULL DEFAULT 'planning',
  progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
  archived_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_proj_cat FOREIGN KEY (category_id) REFERENCES service_categories(id),
  CONSTRAINT fk_proj_client FOREIGN KEY (client_id) REFERENCES users(id),
  CONSTRAINT fk_proj_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_proj_manager FOREIGN KEY (manager_id) REFERENCES users(id),
  CONSTRAINT fk_proj_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_proj_progress CHECK (progress <= 100),
  CONSTRAINT chk_proj_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  INDEX idx_proj_status (status),
  INDEX idx_proj_client (client_id),
  INDEX idx_proj_manager (manager_id),
  INDEX idx_proj_company (company_id)
) ENGINE=InnoDB;

CREATE TABLE project_members (
  project_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, user_id),
  CONSTRAINT fk_pm_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE project_milestones (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  due_date DATE NULL,
  is_done TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_ms_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_ms_project (project_id)
) ENGINE=InnoDB;

CREATE TABLE tasks (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  assignee_id INT UNSIGNED NULL,
  priority ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  status ENUM('todo','in_progress','blocked','done') NOT NULL DEFAULT 'todo',
  start_date DATE NULL,
  due_date DATE NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_task_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_assignee FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_task_creator FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_task_project (project_id),
  INDEX idx_task_assignee (assignee_id),
  INDEX idx_task_due (due_date)
) ENGINE=InnoDB;

CREATE TABLE project_progress_updates (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  progress TINYINT UNSIGNED NOT NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pu_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_pu_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT chk_pu_progress CHECK (progress <= 100),
  INDEX idx_pu_project (project_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE suppliers (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id INT UNSIGNED NULL,
  name VARCHAR(150) NOT NULL,
  contact_name VARCHAR(120) NULL,
  phone VARCHAR(30) NULL,
  email VARCHAR(190) NULL,
  location VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sup_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE materials (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(80) NULL,
  unit VARCHAR(20) NOT NULL,
  description VARCHAR(500) NULL,
  supplier_id INT UNSIGNED NULL,
  unit_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  stock_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
  reorder_level DECIMAL(14,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mat_sup FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  CONSTRAINT chk_mat_stock CHECK (stock_qty >= 0),
  UNIQUE KEY uq_material_name_unit (name, unit),
  INDEX idx_mat_category (category)
) ENGINE=InnoDB;

CREATE TABLE inventory_movements (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  material_id INT UNSIGNED NOT NULL,
  project_id INT UNSIGNED NULL,
  movement_type ENUM('in','out','adjust') NOT NULL,
  quantity DECIMAL(14,3) NOT NULL,
  unit_cost DECIMAL(14,2) NULL,
  note VARCHAR(255) NULL,
  user_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_im_mat FOREIGN KEY (material_id) REFERENCES materials(id),
  CONSTRAINT fk_im_proj FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  CONSTRAINT fk_im_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_im_material (material_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE quotation_requests (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  client_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  category_id SMALLINT UNSIGNED NULL,
  location VARCHAR(150) NULL,
  budget_hint DECIMAL(14,2) NULL,
  deadline DATE NULL,
  status ENUM('open','awarded','closed') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_qr_client FOREIGN KEY (client_id) REFERENCES users(id),
  CONSTRAINT fk_qr_cat FOREIGN KEY (category_id) REFERENCES service_categories(id),
  INDEX idx_qr_status (status)
) ENGINE=InnoDB;

CREATE TABLE quotations (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  request_id INT UNSIGNED NOT NULL,
  provider_id INT UNSIGNED NOT NULL,
  version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  notes VARCHAR(1000) NULL,
  valid_until DATE NULL,
  status ENUM('submitted','accepted','rejected','superseded') NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_q_req FOREIGN KEY (request_id) REFERENCES quotation_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_q_provider FOREIGN KEY (provider_id) REFERENCES users(id),
  UNIQUE KEY uq_quote_version (request_id, provider_id, version),
  INDEX idx_q_provider (provider_id)
) ENGINE=InnoDB;

CREATE TABLE quotation_items (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  quotation_id INT UNSIGNED NOT NULL,
  item_type ENUM('labour','material','equipment','transport','other') NOT NULL,
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(14,3) NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL,
  line_total DECIMAL(14,2) NOT NULL,
  CONSTRAINT fk_qi_q FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
  CONSTRAINT chk_qi_qty CHECK (quantity > 0),
  CONSTRAINT chk_qi_price CHECK (unit_price >= 0)
) ENGINE=InnoDB;

CREATE TABLE expenses (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  category ENUM('labour','material','equipment','transport','other') NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  expense_date DATE NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  submitted_by INT UNSIGNED NOT NULL,
  reviewed_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ex_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_ex_sub FOREIGN KEY (submitted_by) REFERENCES users(id),
  CONSTRAINT fk_ex_rev FOREIGN KEY (reviewed_by) REFERENCES users(id),
  CONSTRAINT chk_ex_amount CHECK (amount > 0),
  INDEX idx_ex_project (project_id, status)
) ENGINE=InnoDB;

CREATE TABLE documents (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  uploaded_by INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(80) NOT NULL UNIQUE,
  mime_type VARCHAR(80) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_doc_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_user FOREIGN KEY (uploaded_by) REFERENCES users(id),
  INDEX idx_doc_project (project_id)
) ENGINE=InnoDB;

CREATE TABLE messages (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  body VARCHAR(2000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_msg_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_msg_project (project_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(150) NOT NULL,
  body VARCHAR(500) NULL,
  link VARCHAR(190) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_n_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_n_user (user_id, is_read, created_at)
) ENGINE=InnoDB;

CREATE TABLE reviews (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  company_id INT UNSIGNED NOT NULL,
  client_id INT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rv_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_rv_client FOREIGN KEY (client_id) REFERENCES users(id),
  CONSTRAINT chk_rv_rating CHECK (rating BETWEEN 1 AND 5),
  UNIQUE KEY uq_review_once (company_id, client_id)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id INT UNSIGNED NULL,
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(40) NULL,
  entity_id INT UNSIGNED NULL,
  details VARCHAR(500) NULL,
  ip VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_action (action)
) ENGINE=InnoDB;

CREATE TABLE system_settings (
  setting_key VARCHAR(60) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL
) ENGINE=InnoDB;
