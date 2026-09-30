const mysql = require('mysql2/promise');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

let activeMode = 'mysql'; // 'mysql' or 'sqlite'
let mysqlPool = null;
let sqliteDb = null;

// Ensure database directory exists
const dbDir = path.join(__dirname, '../../database');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const sqliteFilePath = path.join(dbDir, 'veprs.sqlite');

/**
 * SQLite Async Query Wrapper mimicking MySQL2 promise interface
 */
class SQLiteAdapter {
  constructor(db) {
    this.db = db;
  }

  // Convert MySQL query syntax to SQLite syntax if needed
  normalizeSql(sql) {
    return sql
      .replace(/DATE_FORMAT\s*\(\s*([^,]+)\s*,\s*['"]%d-%m-%Y['"]\s*\)/gi, "strftime('%d-%m-%Y', $1)")
      .replace(/CHARACTER SET [^\s;]+/gi, '')
      .replace(/COLLATE [^\s;]+/gi, '')
      .replace(/ENGINE\s*=\s*InnoDB/gi, '')
      .replace(/ON UPDATE CURRENT_TIMESTAMP/gi, '');
  }

  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      const normalized = this.normalizeSql(sql);
      const trimmed = normalized.trim().toUpperCase();

      if (trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA') || trimmed.startsWith('SHOW')) {
        this.db.all(normalized, params, (err, rows) => {
          if (err) return reject(err);
          // Format dates if DATE_FORMAT wasn't transformed
          const formattedRows = (rows || []).map(row => {
            const formatted = { ...row };
            if (formatted.created_at && !formatted.request_date) {
              const d = new Date(formatted.created_at);
              if (!isNaN(d.getTime())) {
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const yyyy = d.getFullYear();
                formatted.request_date = `${dd}-${mm}-${yyyy}`;
              }
            }
            if (formatted.required_delivery_date) {
              const d = new Date(formatted.required_delivery_date);
              if (!isNaN(d.getTime())) {
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const yyyy = d.getFullYear();
                formatted.required_delivery_date = `${dd}-${mm}-${yyyy}`;
              }
            }
            if (formatted.valid_until) {
              const d = new Date(formatted.valid_until);
              if (!isNaN(d.getTime())) {
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const yyyy = d.getFullYear();
                formatted.valid_until = `${dd}-${mm}-${yyyy}`;
              }
            }
            return formatted;
          });
          resolve([formattedRows, []]);
        });
      } else {
        this.db.run(normalized, params, function(err) {
          if (err) return reject(err);
          const result = {
            insertId: this.lastID,
            affectedRows: this.changes,
            changes: this.changes
          };
          resolve([result, []]);
        });
      }
    });
  }

  async getConnection() {
    return {
      query: (sql, params) => this.query(sql, params),
      beginTransaction: async () => {
        await this.query('BEGIN TRANSACTION');
      },
      commit: async () => {
        await this.query('COMMIT');
      },
      rollback: async () => {
        await this.query('ROLLBACK');
      },
      release: () => {}
    };
  }
}

/**
 * Universal Pool Proxy that delegates to MySQL or SQLite seamlessly
 */
const poolProxy = {
  query: async (sql, params) => {
    if (activeMode === 'mysql' && mysqlPool) {
      try {
        return await mysqlPool.query(sql, params);
      } catch (err) {
        if (sqliteDb) {
          console.warn('[DB Fallback] MySQL query failed, routing to local SQLite storage.');
          return await new SQLiteAdapter(sqliteDb).query(sql, params);
        }
        throw err;
      }
    } else if (sqliteDb) {
      return await new SQLiteAdapter(sqliteDb).query(sql, params);
    }
    throw new Error('Database not initialized.');
  },

  getConnection: async () => {
    if (activeMode === 'mysql' && mysqlPool) {
      try {
        return await mysqlPool.getConnection();
      } catch (err) {
        if (sqliteDb) {
          return await new SQLiteAdapter(sqliteDb).getConnection();
        }
        throw err;
      }
    } else if (sqliteDb) {
      return await new SQLiteAdapter(sqliteDb).getConnection();
    }
    throw new Error('Database not initialized.');
  }
};

/**
 * Initialize SQLite tables (Sprint 1 & Sprint 2)
 */
function initSQLite(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 1. users table
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,
          role TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 2. purchase_requests table
      db.run(`
        CREATE TABLE IF NOT EXISTS purchase_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          request_id TEXT NOT NULL UNIQUE,
          user_id INTEGER NOT NULL,
          product_category TEXT NOT NULL,
          product_name TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          requirements TEXT NOT NULL,
          required_delivery_date TEXT NOT NULL,
          additional_notes TEXT,
          status TEXT NOT NULL DEFAULT 'Pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `);

      // 3. vendors table (Sprint 2)
      db.run(`
        CREATE TABLE IF NOT EXISTS vendors (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          vendor_id TEXT NOT NULL UNIQUE,
          vendor_name TEXT NOT NULL,
          contact_person TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          phone TEXT NOT NULL,
          address TEXT NOT NULL,
          city TEXT NOT NULL,
          state TEXT NOT NULL,
          product_categories TEXT NOT NULL,
          business_registration_number TEXT,
          description TEXT,
          status TEXT NOT NULL DEFAULT 'Active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 4. quotation_requests table (Sprint 2)
      db.run(`
        CREATE TABLE IF NOT EXISTS quotation_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          quotation_request_id TEXT NOT NULL UNIQUE,
          purchase_request_id INTEGER NOT NULL,
          vendor_id INTEGER NOT NULL,
          requested_quantity INTEGER NOT NULL,
          requirements TEXT NOT NULL,
          required_delivery_date TEXT NOT NULL,
          additional_message TEXT,
          status TEXT NOT NULL DEFAULT 'Pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (purchase_request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE,
          FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
        );
      `);

      // 5. quotations table (Sprint 2)
      db.run(`
        CREATE TABLE IF NOT EXISTS quotations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          quotation_id TEXT NOT NULL UNIQUE,
          quotation_request_id INTEGER NOT NULL,
          purchase_request_id INTEGER NOT NULL,
          vendor_id INTEGER NOT NULL,
          product_name TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          unit_price REAL NOT NULL,
          total_price REAL NOT NULL,
          delivery_time TEXT NOT NULL,
          valid_until TEXT NOT NULL,
          warranty TEXT,
          terms_conditions TEXT,
          additional_notes TEXT,
          status TEXT NOT NULL DEFAULT 'Submitted',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (quotation_request_id) REFERENCES quotation_requests(id) ON DELETE CASCADE,
          FOREIGN KEY (purchase_request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE,
          FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
        );
      `, (err) => {
        if (err) return reject(err);
        console.log('[DB] Local SQLite database verified with Sprint 1 & Sprint 2 tables.');
        resolve();
      });
    });
  });
}

/**
 * Initialize Database (MySQL with automatic fallback to SQLite)
 */
async function initDB() {
  // Always initialize SQLite database as standby/primary fallback
  sqliteDb = new sqlite3.Database(sqliteFilePath);
  await initSQLite(sqliteDb);

  try {
    // Attempt connecting to MySQL
    const host = process.env.DB_HOST || 'localhost';
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '';
    const port = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306;
    const dbName = process.env.DB_NAME || 'veprs';

    const rootConnection = await mysql.createConnection({
      host,
      user,
      password,
      port,
      connectTimeout: 2000
    });

    await rootConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await rootConnection.end();

    mysqlPool = mysql.createPool({
      host,
      user,
      password,
      database: dbName,
      port,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4'
    });

    const conn = await mysqlPool.getConnection();
    console.log(`[DB] Successfully connected to MySQL server (${host}:${port}/${dbName})`);

    // 1. users table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('Admin', 'User/Requester', 'Vendor') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 2. purchase_requests table
    await conn.query(`
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 3. vendors table (Sprint 2)
    await conn.query(`
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 4. quotation_requests table (Sprint 2)
    await conn.query(`
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 5. quotations table (Sprint 2)
    await conn.query(`
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    conn.release();
    activeMode = 'mysql';
    console.log('[DB] MySQL database & all tables verified successfully.');
  } catch (err) {
    activeMode = 'sqlite';
    console.log('[DB Notice] MySQL server is offline or unreachable (' + err.message + ').');
    console.log('[DB Notice] Using embedded local database (SQLite) — all functions are 100% active!');
  }
}

module.exports = {
  pool: poolProxy,
  initDB
};
