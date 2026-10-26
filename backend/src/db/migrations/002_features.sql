-- 002: features needed on top of 001_init.sql (task dependencies and history, per-service reviews,
-- any-provider services, inventory balances, expense/quotation audit columns).

ALTER TABLE users ADD COLUMN location VARCHAR(120) NULL AFTER phone;
ALTER TABLE companies ADD COLUMN email VARCHAR(190) NULL AFTER phone;

-- Services can be offered by any provider (engineer, supplier...), not only companies.
ALTER TABLE services
  MODIFY company_id INT UNSIGNED NULL,
  ADD COLUMN provider_id INT UNSIGNED NULL AFTER id,
  ADD COLUMN location VARCHAR(120) NULL AFTER description,
  ADD CONSTRAINT fk_service_provider FOREIGN KEY (provider_id) REFERENCES users(id),
  ADD INDEX idx_service_provider (provider_id);
UPDATE services s JOIN companies c ON c.id = s.company_id SET s.provider_id = c.owner_id WHERE s.provider_id IS NULL;

-- Reviews belong to a service; each client may review a service once (abuse prevention).
ALTER TABLE reviews
  ADD INDEX idx_rv_company (company_id),
  MODIFY company_id INT UNSIGNED NULL,
  ADD COLUMN service_id INT UNSIGNED NULL AFTER company_id,
  ADD CONSTRAINT fk_rv_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  DROP INDEX uq_review_once,
  ADD UNIQUE KEY uq_review_service_once (service_id, client_id);

-- Task dependencies and a history of status changes.
ALTER TABLE tasks
  ADD COLUMN depends_on_task_id INT UNSIGNED NULL AFTER due_date,
  ADD CONSTRAINT fk_task_dep FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE SET NULL;

CREATE TABLE task_events (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  task_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NOT NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_te_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_te_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_te_task (task_id)
) ENGINE=InnoDB;

-- Inventory keeps a running balance on every movement.
ALTER TABLE inventory_movements ADD COLUMN balance_after DECIMAL(14,3) NOT NULL DEFAULT 0 AFTER quantity;

-- Expenses: one spelling of "labor" everywhere, link to the stock movement that created them, review time.
ALTER TABLE expenses MODIFY category ENUM('labour','labor','material','equipment','transport','other') NOT NULL;
UPDATE expenses SET category = 'labor' WHERE category = 'labour';
ALTER TABLE expenses
  MODIFY category ENUM('labor','material','equipment','transport','other') NOT NULL,
  ADD COLUMN reviewed_at DATETIME NULL AFTER reviewed_by,
  ADD COLUMN inventory_movement_id INT UNSIGNED NULL,
  ADD CONSTRAINT fk_exp_movement FOREIGN KEY (inventory_movement_id) REFERENCES inventory_movements(id) ON DELETE SET NULL;

ALTER TABLE quotation_items MODIFY item_type ENUM('labour','labor','material','equipment','transport','other') NOT NULL;
UPDATE quotation_items SET item_type = 'labor' WHERE item_type = 'labour';
ALTER TABLE quotation_items MODIFY item_type ENUM('labor','material','equipment','transport','other') NOT NULL;

ALTER TABLE quotations ADD COLUMN decided_at DATETIME NULL;
