const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { initDB } = require('./config/db');
const { connectMongoDB, isMongoConnected } = require('./config/mongodb');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// API Routes (Sprint 1 & Sprint 2)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/vendors', require('./routes/vendors'));
app.use('/api/quotation-requests', require('./routes/quotationRequests'));
app.use('/api/vendor', require('./routes/vendorRequests'));
app.use('/api/quotations', require('./routes/quotations'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    system: 'Vendor Evaluation and Purchase Recommendation System (VEPRS)',
    sprint: 2,
    database: {
      mongodb: isMongoConnected() ? 'connected' : 'fallback_mode',
      sql: 'initialized'
    },
    timestamp: new Date().toISOString()
  });
});

// Serve frontend default landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Server Error]:', err.stack || err);
  res.status(500).json({
    success: false,
    message: 'An unexpected server error occurred.'
  });
});

// Start Server & Initialize Databases
app.listen(PORT, async () => {
  console.log('========================================================');
  console.log(` VEPRS Backend Server running on: http://localhost:${PORT}`);
  console.log(` Frontend Web Application: http://localhost:${PORT}`);
  console.log('========================================================');
  
  // 1. Initialize SQL / SQLite tables for relational features
  await initDB();

  // 2. Initialize MongoDB Atlas Cloud Connection & seed test accounts
  await connectMongoDB();
});

module.exports = app;
