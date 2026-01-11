const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// __dirname is always the directory containing this file (formghost-site)
const siteDir = __dirname;

// Initialize SQLite database
const db = new Database(path.join(siteDir, 'subscribers.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT
  )
`);

// Email transporter configuration (Postal SMTP)
const transporter = nodemailer.createTransport({
  host: process.env.POSTAL_HOST || '[YOUR_POSTAL_HOST]',
  port: parseInt(process.env.POSTAL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.POSTAL_USERNAME || '[YOUR_POSTAL_USERNAME]',
    pass: process.env.POSTAL_PASSWORD || '[YOUR_POSTAL_API_KEY]'
  }
});

const FROM_ADDRESS = process.env.POSTAL_FROM || '[YOUR_SENDING_ADDRESS]';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || '[YOUR_PERSONAL_EMAIL]';

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
    const existing = db.prepare('SELECT id FROM subscribers WHERE email = ?').get(cleanEmail);
    if (existing) {
      return res.json({ success: true, message: 'Already subscribed' });
    }

    // Get IP and user agent for records
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    // Insert into database
    const stmt = db.prepare('INSERT INTO subscribers (email, ip_address, user_agent) VALUES (?, ?, ?)');
    stmt.run(cleanEmail, ipAddress, userAgent);

    // Get subscriber count
    const count = db.prepare('SELECT COUNT(*) as count FROM subscribers').get();

    // Send notification email (don't await, fire and forget)
    sendNotificationEmail(cleanEmail, count.count).catch(err => {
      console.error('Failed to send notification email:', err.message);
    });

    res.json({ success: true });

  } catch (error) {
    console.error('Subscribe error:', error);

    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.json({ success: true, message: 'Already subscribed' });
    }

    res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
});

// Send notification email
async function sendNotificationEmail(subscriberEmail, totalCount) {
  const mailOptions = {
    from: FROM_ADDRESS,
    to: NOTIFY_EMAIL,
    subject: `New FormGhost Waitlist Signup (#${totalCount})`,
    text: `New subscriber joined the FormGhost waitlist!\n\nEmail: ${subscriberEmail}\nTotal subscribers: ${totalCount}\nTime: ${new Date().toISOString()}`,
    html: `
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
  };

  await transporter.sendMail(mailOptions);
}

// Handle SPA-style routing - serve index.html for unknown routes
app.get('*', (req, res) => {
  const ext = path.extname(req.path);
  if (ext && ext !== '.html') {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(siteDir, 'index.html'));
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`FormGhost site running on port ${PORT}`);
});
