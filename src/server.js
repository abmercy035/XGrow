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
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// --- WAITLIST LOCKDOWN MIDDLEWARE ---
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient(); // Local instance for middleware check

app.use(async (req, res, next) => {
  // List of open paths (Static assets, Auth, Payment Landing, etc.)
  const openPaths = [
    '/landing.html',
    '/payment.html',
    '/login.html',
    '/waitlist-success.html',
    '/auth',
    '/api/payment',
    '/css',
    '/js',
    '/images',
    '/favicon.ico'
  ];

  // Check if path starts with any open path
  const isPublic = openPaths.some(path => req.path.startsWith(path));

  // Explicitly handle root '/' vs index.html
  const isRoot = req.path === '/' || req.path === '/index.html';

  if (isRoot) {
    if (!req.session.userId) {
      return res.redirect('/landing.html');
    }

    // Allow Session check (double check from DB for safety or rely on session)
    // For speed, check session first. 
    const user = req.session.user; // Cached user

    if (!user) return res.redirect('/landing.html');

    // ADMIN BYPASS
    if (user.isAdmin) {
      return next(); // Proceed to serve index.html via static
    }

    // PAID USER LOCKOUT
    if (user.isPro) {
      return res.redirect('/waitlist-success.html');
    }

    // UNPAID REDIRECT
    return res.redirect('/payment.html');
  }

  // Protect other undefined routes? 
  // For now, let static middleware handle specific files, but if someone tries to direct link 
  // to a protected .html (if any exist besides index), we might want to block custom.
  // Index.html is the only dashboard SPA file.

  next();
});

// Static files (This serves index.html for '/' if next() is called)
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
