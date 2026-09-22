-- ==========================================================
-- Expense Tracker MySQL 8.0 Schema & Seed
-- Crafted by Shradha Thakur
-- ==========================================================

CREATE DATABASE IF NOT EXISTS `expense_tracker` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `expense_tracker`;

-- Disable Foreign Key Checks during setup
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(80) NOT NULL UNIQUE,
    `email` VARCHAR(120) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `full_name` VARCHAR(120) NOT NULL,
    `active_account_id` INT DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_user_username` (`username`),
    INDEX `idx_user_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Accounts Table (Individual or Joint / Duo accounts)
CREATE TABLE IF NOT EXISTS `accounts` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `account_type` VARCHAR(20) DEFAULT 'individual',
    `currency` VARCHAR(10) DEFAULT '₹',
    `created_by_id` INT NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_account_creator` (`created_by_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Account Members Table (Enables Two People in One Account)
CREATE TABLE IF NOT EXISTS `account_members` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `account_id` INT NOT NULL,
    `user_id` INT DEFAULT NULL,
    `name` VARCHAR(100) NOT NULL,
    `role` VARCHAR(50) DEFAULT 'Primary',
    `avatar_color` VARCHAR(30) DEFAULT '#6366f1',
    `monthly_budget` DECIMAL(12, 2) DEFAULT 50000.00,
    `email` VARCHAR(120) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    INDEX `idx_member_account` (`account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Categories Table (Standard & Custom Categories)
CREATE TABLE IF NOT EXISTS `categories` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `account_id` INT DEFAULT NULL,
    `name` VARCHAR(100) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `icon` VARCHAR(50) DEFAULT 'fa-tag',
    `color` VARCHAR(30) DEFAULT '#10b981',
    `is_default` BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE CASCADE,
    INDEX `idx_cat_account` (`account_id`),
    INDEX `idx_cat_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Transactions Table (Gain in Income and Expenditure Records)
CREATE TABLE IF NOT EXISTS `transactions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `account_id` INT NOT NULL,
    `member_id` INT DEFAULT NULL,
    `type` VARCHAR(20) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `category_id` INT NOT NULL,
    `date` DATE NOT NULL,
    `payment_method` VARCHAR(50) DEFAULT 'UPI / Bank Transfer',
    `notes` TEXT,
    `tags` VARCHAR(255) DEFAULT '',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`member_id`) REFERENCES `account_members`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT,
    INDEX `idx_trans_account` (`account_id`),
    INDEX `idx_trans_member` (`member_id`),
    INDEX `idx_trans_date` (`date`),
    INDEX `idx_trans_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Re-enable Foreign Key Checks
SET FOREIGN_KEY_CHECKS = 1;

-- Seed Standard Indian Rupee Base Categories (Only inserted if not present)
INSERT INTO `categories` (`name`, `type`, `icon`, `color`, `is_default`, `account_id`)
SELECT 'Food & Dining', 'expense', 'fa-utensils', '#f59e0b', 1, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `name` = 'Food & Dining' AND `type` = 'expense' AND `account_id` IS NULL);

INSERT INTO `categories` (`name`, `type`, `icon`, `color`, `is_default`, `account_id`)
SELECT 'Groceries', 'expense', 'fa-basket-shopping', '#10b981', 1, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `name` = 'Groceries' AND `type` = 'expense' AND `account_id` IS NULL);

INSERT INTO `categories` (`name`, `type`, `icon`, `color`, `is_default`, `account_id`)
SELECT 'Housing & Rent', 'expense', 'fa-house', '#6366f1', 1, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `name` = 'Housing & Rent' AND `type` = 'expense' AND `account_id` IS NULL);

INSERT INTO `categories` (`name`, `type`, `icon`, `color`, `is_default`, `account_id`)
SELECT 'Utilities & Bills', 'expense', 'fa-bolt', '#3b82f6', 1, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `name` = 'Utilities & Bills' AND `type` = 'expense' AND `account_id` IS NULL);

INSERT INTO `categories` (`name`, `type`, `icon`, `color`, `is_default`, `account_id`)
SELECT 'Transport & Fuel', 'expense', 'fa-car', '#06b6d4', 1, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `name` = 'Transport & Fuel' AND `type` = 'expense' AND `account_id` IS NULL);

INSERT INTO `categories` (`name`, `type`, `icon`, `color`, `is_default`, `account_id`)
SELECT 'Shopping & Lifestyle', 'expense', 'fa-bag-shopping', '#ec4899', 1, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `name` = 'Shopping & Lifestyle' AND `type` = 'expense' AND `account_id` IS NULL);

INSERT INTO `categories` (`name`, `type`, `icon`, `color`, `is_default`, `account_id`)
SELECT 'Health & Medical', 'expense', 'fa-heart-pulse', '#ef4444', 1, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `name` = 'Health & Medical' AND `type` = 'expense' AND `account_id` IS NULL);

INSERT INTO `categories` (`name`, `type`, `icon`, `color`, `is_default`, `account_id`)
SELECT 'Entertainment', 'expense', 'fa-film', '#8b5cf6', 1, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `name` = 'Entertainment' AND `type` = 'expense' AND `account_id` IS NULL);

INSERT INTO `categories` (`name`, `type`, `icon`, `color`, `is_default`, `account_id`)
SELECT 'Travel & Vacation', 'expense', 'fa-plane', '#f97316', 1, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `name` = 'Travel & Vacation' AND `type` = 'expense' AND `account_id` IS NULL);

INSERT INTO `categories` (`name`, `type`, `icon`, `color`, `is_default`, `account_id`)
SELECT 'Subscriptions', 'expense', 'fa-repeat', '#a855f7', 1, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `name` = 'Subscriptions' AND `type` = 'expense' AND `account_id` IS NULL);

INSERT INTO `categories` (`name`, `type`, `icon`, `color`, `is_default`, `account_id`)
SELECT 'Investments & Savings', 'expense', 'fa-chart-pie', '#14b8a6', 1, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `name` = 'Investments & Savings' AND `type` = 'expense' AND `account_id` IS NULL);

INSERT INTO `categories` (`name`, `type`, `icon`, `color`, `is_default`, `account_id`)
SELECT 'Miscellaneous', 'expense', 'fa-layer-group', '#64748b', 1, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `name` = 'Miscellaneous' AND `type` = 'expense' AND `account_id` IS NULL);

-- Incomes
INSERT INTO `categories` (`name`, `type`, `icon`, `color`, `is_default`, `account_id`)
SELECT 'Primary Salary', 'income', 'fa-money-bill-wave', '#10b981', 1, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `name` = 'Primary Salary' AND `type` = 'income' AND `account_id` IS NULL);

INSERT INTO `categories` (`name`, `type`, `icon`, `color`, `is_default`, `account_id`)
SELECT 'Freelance & Consulting', 'income', 'fa-laptop-code', '#3b82f6', 1, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `name` = 'Freelance & Consulting' AND `type` = 'income' AND `account_id` IS NULL);

INSERT INTO `categories` (`name`, `type`, `icon`, `color`, `is_default`, `account_id`)
SELECT 'Investments & Dividends', 'income', 'fa-arrow-trend-up', '#8b5cf6', 1, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `name` = 'Investments & Dividends' AND `type` = 'income' AND `account_id` IS NULL);

INSERT INTO `categories` (`name`, `type`, `icon`, `color`, `is_default`, `account_id`)
SELECT 'Bonus & Rewards', 'income', 'fa-gift', '#ec4899', 1, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `name` = 'Bonus & Rewards' AND `type` = 'income' AND `account_id` IS NULL);

INSERT INTO `categories` (`name`, `type`, `icon`, `color`, `is_default`, `account_id`)
SELECT 'Side Hustle', 'income', 'fa-rocket', '#f59e0b', 1, NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `name` = 'Side Hustle' AND `type` = 'income' AND `account_id` IS NULL);
