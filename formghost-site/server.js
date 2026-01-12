const express = require('express');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();
const PORT = process.env.PORT || 3000;

// __dirname is always the directory containing this file (formghost-site)
const siteDir = __dirname;
const dbPath = path.join(siteDir, 'subscribers.db');

let db;

// Initialize SQLite database
async function initDatabase() {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ip_address TEXT,
      user_agent TEXT
    )
  `);

  saveDatabase();
}

// Save database to disk
function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

// Postal HTTP API configuration
const POSTAL_HOST = process.env.POSTAL_HOST || 'mail.driftly.email';
const POSTAL_API_KEY = process.env.POSTAL_PASSWORD;
const FROM_ADDRESS = process.env.POSTAL_FROM || 'noreply@driftly.email';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;

// Middleware
app.use(express.json());
app.use(express.static(siteDir));

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Subscribe endpoint
app.post('/subscribe', async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email format
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address' });
    }

    // Check if email already exists
    const existing = db.exec('SELECT id FROM subscribers WHERE email = ?', [cleanEmail]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      return res.json({ success: true, message: 'Already subscribed' });
    }

    // Get IP and user agent for records
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    // Insert into database
    db.run('INSERT INTO subscribers (email, ip_address, user_agent) VALUES (?, ?, ?)',
      [cleanEmail, ipAddress, userAgent]);
    saveDatabase();

    // Get subscriber count
    const countResult = db.exec('SELECT COUNT(*) as count FROM subscribers');
    const count = countResult[0].values[0][0];

    // Send notification email (don't await, fire and forget)
    sendNotificationEmail(cleanEmail, count).catch(err => {
      console.error('Failed to send notification email:', err.message);
    });

    res.json({ success: true });

  } catch (error) {
    console.error('Subscribe error:', error);

    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      return res.json({ success: true, message: 'Already subscribed' });
    }

    res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
});

// Send notification email via Postal HTTP API
async function sendNotificationEmail(subscriberEmail, totalCount) {
  const response = await fetch(`https://${POSTAL_HOST}/api/v1/send/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Server-API-Key': POSTAL_API_KEY
    },
    body: JSON.stringify({
      to: [NOTIFY_EMAIL],
      from: FROM_ADDRESS,
      subject: `New FormGhost Waitlist Signup (#${totalCount})`,
      plain_body: `New subscriber joined the FormGhost waitlist!\n\nEmail: ${subscriberEmail}\nTotal subscribers: ${totalCount}\nTime: ${new Date().toISOString()}`,
      html_body: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #1a1a1a; margin-bottom: 16px;">New FormGhost Waitlist Signup</h2>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
            <p style="margin: 0 0 8px 0; color: #525252;">Email:</p>
            <p style="margin: 0; font-size: 18px; color: #1a1a1a; font-weight: 500;">${subscriberEmail}</p>
          </div>
          <p style="color: #737373; font-size: 14px;">
            Total subscribers: <strong>${totalCount}</strong><br>
            Time: ${new Date().toLocaleString()}
          </p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Postal API error: ${error}`);
  }
}

// Handle SPA-style routing - serve index.html for unknown routes
app.get('*', (req, res) => {
  const ext = path.extname(req.path);
  if (ext && ext !== '.html') {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(siteDir, 'index.html'));
});

// Start server after database is ready
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`FormGhost site running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
