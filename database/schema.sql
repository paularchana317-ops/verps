-- ==========================================================
-- Vendor Evaluation and Purchase Recommendation System (VEPRS)
-- Sprint 1 & Sprint 2 Database Schema
-- ==========================================================

CREATE DATABASE IF NOT EXISTS veprs;
USE veprs;

-- ----------------------------------------------------------
-- Table: users
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('Admin', 'User/Requester', 'Vendor') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- Table: purchase_requests
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id VARCHAR(50) NOT NULL UNIQUE,
    user_id INT NOT NULL,
    product_category VARCHAR(100) NOT NULL,
    product_name VARCHAR(150) NOT NULL,
    quantity INT NOT NULL,
    requirements TEXT NOT NULL,
    required_delivery_date DATE NOT NULL,
    additional_notes TEXT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_purchase_requests_user_id 
        FOREIGN KEY (user_id) REFERENCES users(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- Table: vendors (Sprint 2 - SCRUM-22 & SCRUM-23)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    vendor_id VARCHAR(50) NOT NULL UNIQUE,
    vendor_name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    phone VARCHAR(50) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    product_categories TEXT NOT NULL,
    business_registration_number VARCHAR(100) NULL,
    description TEXT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- Table: quotation_requests (Sprint 2 - SCRUM-24)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotation_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quotation_request_id VARCHAR(50) NOT NULL UNIQUE,
    purchase_request_id INT NOT NULL,
    vendor_id INT NOT NULL,
    requested_quantity INT NOT NULL,
    requirements TEXT NOT NULL,
    required_delivery_date DATE NOT NULL,
    additional_message TEXT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_quotation_requests_purchase_request_id 
        FOREIGN KEY (purchase_request_id) REFERENCES purchase_requests(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    CONSTRAINT fk_quotation_requests_vendor_id 
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- Table: quotations (Sprint 2 - SCRUM-25)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quotation_id VARCHAR(50) NOT NULL UNIQUE,
    quotation_request_id INT NOT NULL,
    purchase_request_id INT NOT NULL,
    vendor_id INT NOT NULL,
    product_name VARCHAR(150) NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    delivery_time VARCHAR(100) NOT NULL,
    valid_until DATE NOT NULL,
    warranty VARCHAR(100) NULL,
    terms_conditions TEXT NULL,
    additional_notes TEXT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Submitted',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_quotations_quotation_request_id 
        FOREIGN KEY (quotation_request_id) REFERENCES quotation_requests(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    CONSTRAINT fk_quotations_purchase_request_id 
        FOREIGN KEY (purchase_request_id) REFERENCES purchase_requests(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    CONSTRAINT fk_quotations_vendor_id 
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Indexes for high performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_purchase_requests_user_id ON purchase_requests(user_id);
CREATE INDEX idx_purchase_requests_status ON purchase_requests(status);
CREATE INDEX idx_purchase_requests_request_id ON purchase_requests(request_id);
CREATE INDEX idx_vendors_email ON vendors(email);
CREATE INDEX idx_vendors_vendor_id ON vendors(vendor_id);
CREATE INDEX idx_vendors_status ON vendors(status);
CREATE INDEX idx_quotation_requests_vendor_id ON quotation_requests(vendor_id);
CREATE INDEX idx_quotation_requests_pr_id ON quotation_requests(purchase_request_id);
CREATE INDEX idx_quotations_vendor_id ON quotations(vendor_id);
CREATE INDEX idx_quotations_pr_id ON quotations(purchase_request_id);
CREATE INDEX idx_quotations_qr_id ON quotations(quotation_request_id);
