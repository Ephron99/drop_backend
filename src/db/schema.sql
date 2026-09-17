-- Voltage Drop Database Schema
-- This schema is IDEMPOTENT and SAFE to run on every server restart.
-- It does NOT drop any tables or data. It uses:
--   - CREATE DATABASE IF NOT EXISTS
--   - CREATE TABLE IF NOT EXISTS
--   - INSERT IGNORE for seed roles
-- Existing data is preserved across server restarts.

CREATE DATABASE IF NOT EXISTS voltage_drop;
USE voltage_drop;

-- ============================================================
-- ROLES
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
    name VARCHAR(50) PRIMARY KEY,
    description VARCHAR(255),
    permissions JSON
);

-- ============================================================
-- HUBS  (Nation → Hub level)
-- Rwanda hierarchy: Nation → Hub → Branch → Line/Feeder → Transformer
-- ============================================================

CREATE TABLE IF NOT EXISTS hubs (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    region VARCHAR(100) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================
-- USERS
-- hub_id links branch_manager and site_engineer to a hub.
-- senior_management/planning/it_engineer/trusted_admin have hub_id = NULL.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    branch VARCHAR(100),
    hub_id CHAR(36) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login_at DATETIME NULL,
    FOREIGN KEY (role) REFERENCES roles(name),
    FOREIGN KEY (hub_id) REFERENCES hubs(id) ON DELETE SET NULL,
    INDEX idx_user_hub (hub_id),
    INDEX idx_user_role (role)
);

-- ============================================================
-- LOCATIONS  (physical substation / feeder station)
-- Optionally linked to a hub.
-- ============================================================

CREATE TABLE IF NOT EXISTS locations (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(500) NOT NULL,
    governorate VARCHAR(100) NOT NULL,
    hub_id CHAR(36) NULL,
    FOREIGN KEY (hub_id) REFERENCES hubs(id) ON DELETE SET NULL,
    INDEX idx_location_hub (hub_id)
);

-- ============================================================
-- BRANCHES  (Branch level)
-- A Hub has many Branches.
-- ============================================================

CREATE TABLE IF NOT EXISTS branches (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    hub_id CHAR(36) NOT NULL,
    length_km DECIMAL(10,3) DEFAULT 0,
    conductor_type VARCHAR(100),
    status ENUM('planned', 'under_construction', 'energized', 'decommissioned') DEFAULT 'planned',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (hub_id) REFERENCES hubs(id) ON DELETE CASCADE,
    INDEX idx_branch_hub (hub_id)
);

-- ============================================================
-- LINES  (Line/Feeder level)
-- A Branch has many Lines.
-- ============================================================

CREATE TABLE IF NOT EXISTS `lines` (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    voltage_level ENUM('MV', 'LV') NOT NULL,
    branch_id CHAR(36) NOT NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
    INDEX idx_line_branch (branch_id)
);

-- ============================================================
-- TRANSFORMERS  (Transformer level)
-- A Line has many Transformers.
-- ============================================================

CREATE TABLE IF NOT EXISTS transformers (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    serial_number VARCHAR(100) UNIQUE NOT NULL,
    capacity_kva INT NOT NULL,
    line_id CHAR(36) NOT NULL,
    FOREIGN KEY (line_id) REFERENCES `lines`(id) ON DELETE CASCADE,
    INDEX idx_transformer_line (line_id)
);

-- ============================================================
-- Management Portal Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
    id CHAR(36) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status ENUM('planning', 'active', 'on_hold', 'completed', 'cancelled') DEFAULT 'planning',
    start_date DATE NULL,
    end_date DATE NULL,
    total_budget DECIMAL(15,2) DEFAULT 0,
    created_by CHAR(36) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_project_status (status)
);

CREATE TABLE IF NOT EXISTS scopes (
    id CHAR(36) PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    hub_id CHAR(36) NULL,
    branch_id CHAR(36) NULL,
    line_id CHAR(36) NULL,
    transformer_id CHAR(36) NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status ENUM('draft', 'approved') DEFAULT 'draft',
    planned_km DECIMAL(10,3) DEFAULT 0,
    planned_transformers INT DEFAULT 0,
    budget_allocated DECIMAL(15,2) DEFAULT 0,
    created_by CHAR(36) NOT NULL,
    approved_by CHAR(36) NULL,
    approved_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (hub_id) REFERENCES hubs(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (line_id) REFERENCES `lines`(id),
    FOREIGN KEY (transformer_id) REFERENCES transformers(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id),
    INDEX idx_scope_project (project_id),
    INDEX idx_scope_status (status),
    INDEX idx_scope_hub (hub_id),
    INDEX idx_scope_branch (branch_id)
);

CREATE TABLE IF NOT EXISTS tasks (
    id CHAR(36) PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    scope_id CHAR(36) NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status ENUM('pending', 'assigned', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending',
    priority ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
    assigned_to CHAR(36) NULL,
    assigned_by CHAR(36) NOT NULL,
    line_id CHAR(36) NULL,
    transformer_id CHAR(36) NULL,
    planned_start_date DATE NULL,
    planned_end_date DATE NULL,
    actual_start_date DATE NULL,
    actual_end_date DATE NULL,
    progress_pct INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (scope_id) REFERENCES scopes(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to) REFERENCES users(id),
    FOREIGN KEY (assigned_by) REFERENCES users(id),
    FOREIGN KEY (line_id) REFERENCES `lines`(id),
    FOREIGN KEY (transformer_id) REFERENCES transformers(id),
    INDEX idx_task_project (project_id),
    INDEX idx_task_scope (scope_id),
    INDEX idx_task_assignee (assigned_to),
    INDEX idx_task_status (status)
);

CREATE TABLE IF NOT EXISTS budget_items (
    id CHAR(36) PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    scope_id CHAR(36) NULL,
    category VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    planned_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    spent_amount DECIMAL(15,2) DEFAULT 0,
    committed_amount DECIMAL(15,2) DEFAULT 0,
    status ENUM('planned', 'active', 'exhausted', 'closed') DEFAULT 'planned',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (scope_id) REFERENCES scopes(id) ON DELETE SET NULL,
    INDEX idx_budget_project (project_id),
    INDEX idx_budget_category (category)
);

CREATE TABLE IF NOT EXISTS fund_transactions (
    id CHAR(36) PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    type ENUM('allocation', 'disbursement', 'commitment', 'refund') NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    description VARCHAR(500),
    reference VARCHAR(100),
    transaction_date DATE NOT NULL,
    created_by CHAR(36) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_fund_project (project_id),
    INDEX idx_fund_type (type),
    INDEX idx_fund_date (transaction_date)
);

CREATE TABLE IF NOT EXISTS progress_entries (
    id CHAR(36) PRIMARY KEY,
    entry_date DATE NOT NULL,
    location_id CHAR(36) NULL,
    scope_id CHAR(36) NULL,
    line_id CHAR(36) NOT NULL,
    voltage_level ENUM('MV', 'LV') NOT NULL,
    transformer_id CHAR(36) NOT NULL,
    progress_pct DECIMAL(5,2) DEFAULT 0,
    completed_km DECIMAL(10,3) DEFAULT 0,
    transformers_installed INT DEFAULT 0,
    transformers_terminated INT DEFAULT 0,
    transformers_tested INT DEFAULT 0,
    transformers_commissioned INT DEFAULT 0,
    status ENUM('draft', 'submitted', 'approved', 'published', 'rejected') DEFAULT 'draft',
    site_engineer_id CHAR(36) NOT NULL,
    branch_manager_id CHAR(36) NULL,
    submitted_at DATETIME NULL,
    approved_at DATETIME NULL,
    published_at DATETIME NULL,
    rejection_comments TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES locations(id),
    FOREIGN KEY (scope_id) REFERENCES scopes(id) ON DELETE SET NULL,
    FOREIGN KEY (line_id) REFERENCES `lines`(id),
    FOREIGN KEY (transformer_id) REFERENCES transformers(id),
    FOREIGN KEY (site_engineer_id) REFERENCES users(id),
    FOREIGN KEY (branch_manager_id) REFERENCES users(id),
    INDEX idx_entry_date (entry_date),
    INDEX idx_status (status),
    INDEX idx_engineer (site_engineer_id),
    INDEX idx_manager (branch_manager_id)
    ,INDEX idx_entry_scope (scope_id)
);

-- ============================================================
-- SEED: Roles (idempotent)
-- ============================================================

INSERT IGNORE INTO roles (name, description, permissions) VALUES
('branch_manager', 'Branch Manager - Enters daily progress data and reviews branch submissions', '{"progress":["create","edit","submit","review","approve","publish","reject"],"dashboard":["view_own","view_branch"]}'),
('hub_manager', 'Hub Manager - Manages projects, scopes, budgets, network assets and monitors progress', '{"scope":["create","edit","manage_budget"],"progress":["view_all"],"projects":["manage"],"assets":["manage"]}'),
('senior_manager', 'Senior Manager - Oversees all hubs across the nation with executive view', '{"dashboard":["view_all_hubs"],"scope":["approve_changes"],"comments":["add"],"records":["view_all"]}'),
('admin', 'Admin - Full system control including user management and system maintenance', '{"system":["full_control","backup","configure","correct_data","manage_users"]}');
