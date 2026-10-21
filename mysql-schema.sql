-- Bethel SDA Church Database
-- MySQL 8.0+
-- Run this script on the MySQL server, not in the browser.

CREATE DATABASE IF NOT EXISTS bethel_sda
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE bethel_sda;

CREATE TABLE families (
  id TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_families_name (name)
) ENGINE=InnoDB;

INSERT INTO families (name) VALUES
  ('Shepherds'),
  ('Apostles'),
  ('Prophets'),
  ('Kings'),
  ('Disciples'),
  ('Children'),
  ('Visitor')
ON DUPLICATE KEY UPDATE name = VALUES(name);

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL DEFAULT 'Administrator',
  role VARCHAR(30) NOT NULL DEFAULT 'admin',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  KEY idx_users_active (is_active)
) ENGINE=InnoDB;

CREATE TABLE members (
  id VARCHAR(20) NOT NULL,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(20) NOT NULL,
  gender VARCHAR(20) NOT NULL,
  family_id TINYINT UNSIGNED NULL,
  marital_status VARCHAR(50) NOT NULL DEFAULT '',
  married_group VARCHAR(100) NOT NULL DEFAULT '',
  class_name VARCHAR(100) NOT NULL DEFAULT '',
  phone VARCHAR(30) NOT NULL DEFAULT '',
  created_at DATE NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_members_category CHECK (category IN ('Member', 'Visitor')),
  CONSTRAINT chk_members_gender CHECK (gender IN ('Male', 'Female')),
  CONSTRAINT fk_members_family
    FOREIGN KEY (family_id) REFERENCES families (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  KEY idx_members_name (name),
  KEY idx_members_family (family_id),
  KEY idx_members_created_at (created_at)
) ENGINE=InnoDB;

CREATE TABLE attendance (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  member_id VARCHAR(20) NOT NULL,
  attendance_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Present',
  checked_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recorded_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attendance_member_date (member_id, attendance_date),
  KEY idx_attendance_date (attendance_date),
  CONSTRAINT chk_attendance_status CHECK (status IN ('Present', 'Absent', 'Excused')),
  CONSTRAINT fk_attendance_member
    FOREIGN KEY (member_id) REFERENCES members (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_attendance_user
    FOREIGN KEY (recorded_by) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE login_sessions (
  id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  last_activity_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_login_sessions_token_hash (token_hash),
  KEY idx_login_sessions_user (user_id),
  KEY idx_login_sessions_expiry (expires_at),
  CONSTRAINT fk_login_sessions_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;
