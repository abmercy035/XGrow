require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5500;

// Middleware
app.set('trust proxy', 1); // Trust first proxy (Vercel)
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Database Pool for Sessions
// Database Pool for Sessions
const isProduction = process.env.NODE_ENV === 'production';
let connectionString = process.env.DATABASE_URL;

console.log('DB Connection String exists:', !!connectionString);

if (connectionString && !connectionString.includes('sslmode=')) {
  connectionString += (connectionString.includes('?') ? '&' : '?') + 'sslmode=no-verify';
} else if (connectionString && connectionString.includes('sslmode=require')) {
  connectionString = connectionString.replace('sslmode=require', 'sslmode=no-verify');
}

// Force loose SSL for Aiven or any production-like environment
const pool = new Pool({
  connectionString: connectionString,
});

app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'session',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' + secure is needed if cross-site (but strictly lax is usually fine for redirects). Sticking to 'lax' for now or 'none' if needed. 
    // Actually, for OAuth redirects, 'lax' is best. 'none' requires secure.
    // Let's safe bet: if production, 'none' (requires secure=true which we have).
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Routes
const authRoutes = require('./routes/authRoutes');
const boardRoutes = require('./routes/boardRoutes');
const profileRoutes = require('./routes/profileRoutes');
const streakRoutes = require('./routes/streakRoutes');
const promotionRoutes = require('./routes/promotionRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');

app.use('/auth', authRoutes);
app.use('/api/boards', boardRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/streak', streakRoutes);
app.use('/api/promote', promotionRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);

// API Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // Start Jobs
  require('./jobs/scheduler');
});
