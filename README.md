# Vendor Evaluation and Purchase Recommendation System (VEPRS)
## Sprint 1 & Sprint 2: Core Platform, Vendor Management & Quotation Management

---

## 1. Overview & Jira Story Mapping

This repository contains the complete implementation for **Sprint 1** and **Sprint 2** of the **Vendor Evaluation and Purchase Recommendation System (VEPRS)**.

### Jira Stories Implemented

| Jira Key | Story Title | Role | Description & Scope | Status |
| :--- | :--- | :--- | :--- | :--- |
| **SCRUM-17** | **User Registration** | Public | Validates user details, hashes passwords with bcrypt (10 rounds), enforces unique emails, stores in database, and redirects to Login. | **Done** |
| **SCRUM-19** | **User Login** | Public | Authenticates credentials, identifies role (`Admin`, `User/Requester`, `Vendor`), creates signed JWT session tokens. | **Done** |
| **SCRUM-43** | **Role-Based Access** | All Roles | Enforces role-based route protection across APIs and web pages. Unauthorized access displays **"Access Denied"** (HTTP 403). | **Done** |
| **Submit Request** | **User Request Management** | User / Requester | Allows requesters to submit product purchase requests, generates unique `REQ-1001` IDs, stores in DB with status `Pending`, and displays in "My Requests". | **Done** |
| **SCRUM-22** | **Add Vendor** | Admin | Admin can register certified vendors with contact info, categories, and business registration. Generates unique `VEN-1001` IDs. | **Done** |
| **SCRUM-23** | **Update Vendor** | Admin | Admin can view the full vendor directory, edit vendor details, update category tags, and toggle `Active`/`Inactive` status. | **Done** |
| **SCRUM-24** | **Request Quotation** | Admin | Admin can browse departmental purchase requests (`REQ-1001`), select active vendors, and dispatch quotation requests (`QR-1001`). | **Done** |
| **SCRUM-25** | **Submit Quotation** | Vendor | Vendor can view quotation requests assigned to their company, enter unit pricing, view real-time automatic total price calculation, and submit quotation (`QUO-1001`). | **Done** |

---

## 2. Complete Project Folder Structure

```
veprs/
│
├── frontend/
│   ├── index.html                  # Landing page & session router
│   ├── register.html               # User registration form with validation
│   ├── login.html                  # User authentication form
│   ├── user-dashboard.html         # Dashboard for User / Requester
│   ├── admin-dashboard.html        # Dashboard for Admin
│   ├── vendor-dashboard.html       # Dashboard for Vendor
│   ├── request-product.html        # Submit Purchase Request form
│   ├── my-requests.html            # User requisition history table
│   ├── vendor-management.html      # Admin: Vendor directory & status tracking
│   ├── add-vendor.html             # Admin: Add New Vendor form
│   ├── edit-vendor.html            # Admin: Update Vendor form
│   ├── purchase-requests.html      # Admin: Requisition list & quotation dispatcher
│   ├── request-quotation.html      # Admin: Multi-vendor quotation dispatch form
│   ├── quotation-requests.html     # Vendor: Assigned tender requests inbox
│   ├── submit-quotation.html       # Vendor: Submit quotation with auto-total calculation
│   │
│   ├── css/
│   │   └── style.css               # Modern, responsive enterprise CSS design system
│   │
│   └── js/
│       ├── auth.js                 # JWT session manager & role-based guards
│       ├── dashboard.js            # Dynamic dashboard & module modal handlers
│       ├── requests.js             # Requisition validation & submission logic
│       ├── vendors.js              # Vendor directory loading, add & edit handlers
│       ├── quotationRequests.js    # PR overview, vendor checklist & QR dispatch
│       └── quotations.js           # Quotation pre-fill, auto-calculation & submit
│
├── backend/
│   ├── server.js                   # Express app entrypoint & static server
│   │
│   ├── config/
│   │   └── db.js                   # Dual-mode database pool (MySQL + SQLite fallback)
│   │
│   ├── routes/
│   │   ├── auth.js                 # Auth endpoints (/register, /login, /me)
│   │   ├── requests.js             # Requisition endpoints (/, /my-requests, /all, /:id)
│   │   ├── vendors.js              # Vendor CRUD endpoints
│   │   ├── quotationRequests.js    # Admin quotation request endpoints
│   │   ├── vendorRequests.js       # Vendor quotation request inbox endpoint
│   │   └── quotations.js           # Quotation submission and query endpoints
│   │
│   ├── controllers/
│   │   ├── authController.js       # Registration & login business logic
│   │   ├── requestController.js    # Requisition submission & query logic
│   │   ├── vendorController.js     # Vendor management business logic
│   │   ├── quotationRequestController.js # QR creation & dispatch logic
│   │   └── quotationController.js  # Quotation submission & pricing logic
│   │
│   └── middleware/
│       ├── authMiddleware.js       # JWT bearer token verification
│       └── roleMiddleware.js       # Role authorization & "Access Denied" guard
│
├── database/
│   ├── schema.sql                  # MySQL database and relational schema DDL
│   └── veprs.sqlite                # Standby local database for offline development
│
├── .env.example                    # Template environment variables
├── .env                            # Local environment configuration
├── package.json                    # Node.js dependencies & scripts
└── README.md                       # Comprehensive system documentation
```

---

## 3. Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6+), Responsive Design (Desktop, Tablet, Mobile).
- **Backend**: Node.js, Express.js.
- **Database**: MySQL (via `mysql2/promise` connection pool) with embedded SQLite standby fallback.
- **Security**: `bcryptjs` (10 salt rounds), `jsonwebtoken` (JWT bearer authentication).

---

## 4. Complete Database Schema (`schema.sql`)

```sql
CREATE DATABASE IF NOT EXISTS veprs;
USE veprs;

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('Admin', 'User/Requester', 'Vendor') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Purchase Requests table
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
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- 3. Vendors table (Sprint 2 - SCRUM-22 & SCRUM-23)
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
);

-- 4. Quotation Requests table (Sprint 2 - SCRUM-24)
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
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_quotation_requests_vendor_id 
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) 
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- 5. Quotations table (Sprint 2 - SCRUM-25)
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
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_quotations_purchase_request_id 
        FOREIGN KEY (purchase_request_id) REFERENCES purchase_requests(id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_quotations_vendor_id 
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) 
        ON DELETE CASCADE ON UPDATE CASCADE
);
```

---

## 5. API Reference

### Authentication Endpoints (`/api/auth`)
- `POST /api/auth/register` — Register a new user account.
- `POST /api/auth/login` — Login with credentials, returns JWT token & user profile.
- `GET /api/auth/me` — *(Protected)* Retrieve current user profile.

### Purchase Request Endpoints (`/api/requests`)
- `POST /api/requests` — *(Protected: User/Requester)* Submit new requisition (e.g. `REQ-1001`).
- `GET /api/requests/my-requests` — *(Protected: User/Requester)* Retrieve logged-in user's requisitions.
- `GET /api/requests/all` — *(Protected: Admin)* Retrieve all departmental requisitions.
- `GET /api/requests/:id` — *(Protected)* Retrieve single requisition details.

### Vendor Management Endpoints (`/api/vendors`)
- `POST /api/vendors` — *(Protected: Admin)* Add new vendor (generates `VEN-1001`).
- `GET /api/vendors` — *(Protected: Admin)* Get all registered vendors.
- `GET /api/vendors/active` — *(Protected: Admin)* Get active vendors for quotation request selection.
- `GET /api/vendors/:id` — *(Protected: Admin)* Get single vendor details.
- `PUT /api/vendors/:id` — *(Protected: Admin)* Update vendor details and status.

### Quotation Request Endpoints (`/api/quotation-requests` & `/api/vendor`)
- `POST /api/quotation-requests` — *(Protected: Admin)* Dispatch quotation requests to 1 or more active vendors (generates `QR-1001`).
- `GET /api/quotation-requests` — *(Protected: Admin)* Get all dispatched quotation requests.
- `GET /api/quotation-requests/:id` — *(Protected: Admin & Vendor)* Get specific quotation request.
- `GET /api/vendor/quotation-requests` — *(Protected: Vendor)* Get quotation requests assigned exclusively to the logged-in vendor.

### Quotation Endpoints (`/api/quotations`)
- `POST /api/quotations` — *(Protected: Vendor)* Submit quotation with unit price, delivery, and terms (generates `QUO-1001`).
- `GET /api/quotations` — *(Protected: Admin & Vendor)* Get quotations.
- `GET /api/quotations/:id` — *(Protected: Admin & Vendor)* Get specific quotation details.

---

## 6. How to Run the Application

### 1. Install Dependencies
```bash
npm install
```

### 2. Start MySQL (Optional)
If MySQL is running on port 3306, VEPRS connects to MySQL. If MySQL is offline, VEPRS automatically uses the embedded local database.

### 3. Start Backend Server
```bash
npm start
```

### 4. Open in Browser
Navigate to:
```
http://localhost:5000
```

---

## 7. Sprint 2 End-to-End Demonstration Guide

Follow the exact 29-step demonstration flow:

1. **Login as Admin**:
   - Open `http://localhost:5000/login.html`.
   - Sign in with Admin credentials (`paulsaarumathy@gmail.com` / `Password@123`).
2. **Open Admin Dashboard** $\rightarrow$ Click **"Vendor Management"**.
3. **Click "Add Vendor"** $\rightarrow$ Open `add-vendor.html`.
4. **Enter Vendor Details**:
   - **Vendor Name**: `ABC Technologies`
   - **Contact Person**: `Raj Kumar`
   - **Email**: `abc@example.com`
   - **Phone**: `9876543210`
   - **Address**: `12 Main Road`
   - **City**: `Coimbatore`
   - **State**: `Tamil Nadu`
   - **Product Categories**: `Computer Accessories`
   - **Business Registration Number**: `BRN1001`
   - **Description**: `Computer hardware supplier`
5. **Click "Add Vendor"**:
   - Success modal appears: `"Vendor added successfully."`
   - Assigned Identifier: **`VEN-1001`**.
6. **Open Vendor Directory** $\rightarrow$ Click **"Edit"** next to `VEN-1001`.
7. **Change vendor information** (e.g. modify description or phone) $\rightarrow$ Click **"Update Vendor"**.
   - Alert displays: `"Vendor details updated successfully."`
8. **Open Purchase Requests** (`purchase-requests.html`).
9. **Select `REQ-1001`** $\rightarrow$ Click **"Request Quotation"**.
10. **Select `ABC Technologies`** from the certified vendor checklist $\rightarrow$ Click **"Send Quotation Request"**.
    - System generates: **`QR-1001`**.
    - Displays: `"Quotation request sent successfully."`
11. **Logout Admin**.
12. **Login as Vendor**:
    - Sign in with Vendor email `abc@example.com` / `Password@123` (or register as Vendor with `abc@example.com`).
13. **Open Vendor Dashboard** $\rightarrow$ Click **"Quotation Requests"**.
14. **Vendor views**:
    ```
    QR-1001 | REQ-1001 | Keyboard | Quantity: 10 | Status: Pending
    ```
15. **Click "View / Submit Quotation"** $\rightarrow$ Opens `submit-quotation.html`.
16. **Enter Quotation Details**:
    - **Unit Price**: `1500`
    - **Automatic Total Price**: System instantly calculates `$15,000.00` (10 × 1500)
    - **Delivery Time**: `7 Days`
    - **Valid Until**: `30-09-2026`
    - **Warranty**: `1 Year`
    - **Terms and Conditions**: `Payment within 30 days.`
    - **Additional Notes**: `Installation included.`
17. **Click "Submit Quotation"**:
    - System generates: **`QUO-1001`**.
    - Displays: `"Quotation submitted successfully."`

---

## 8. Sample Test Credentials

| Role | Full Name | Email | Password | Primary Accessible Dashboards & Pages |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | Paul Saarumathy A | `paulsaarumathy@gmail.com` | `Password@123` | `admin-dashboard.html`, `vendor-management.html`, `add-vendor.html`, `edit-vendor.html`, `purchase-requests.html`, `request-quotation.html` |
| **User/Requester** | Requester Test | `requester.test@gmail.com` | `Password@123` | `user-dashboard.html`, `request-product.html`, `my-requests.html` |
| **Vendor** | Raj Kumar | `abc@example.com` | `Password@123` | `vendor-dashboard.html`, `quotation-requests.html`, `submit-quotation.html` |
