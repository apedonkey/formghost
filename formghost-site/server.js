const express = require('express');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();
const PORT = process.env.PORT || 3000;

const siteDir = __dirname;
const dbPath = path.join(siteDir, 'subscribers.db');

let db;

// Initialize SQLite database
async function initDatabase() {
  const SQL = await initSqlJs();

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

function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

// Postal HTTP API configuration
const POSTAL_API_KEY = process.env.POSTAL_PASSWORD;
const POSTAL_API_HOST = process.env.POSTAL_API_HOST || 'postal.driftly.email';
const FROM_ADDRESS = process.env.POSTAL_FROM || 'noreply@driftly.email';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;

console.log('Postal API Config:', { host: POSTAL_API_HOST, from: FROM_ADDRESS, to: NOTIFY_EMAIL, keySet: !!POSTAL_API_KEY });

async function sendEmail({ to, subject, text, html }) {
  const response = await fetch(`https://${POSTAL_API_HOST}/api/v1/send/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Server-API-Key': POSTAL_API_KEY
    },
    body: JSON.stringify({
      to: [to],
      from: FROM_ADDRESS,
      subject,
      plain_body: text,
      html_body: html
    })
  });

  const data = await response.json();
  if (data.status !== 'success') {
    throw new Error(data.data?.message || 'Email send failed');
  }
  return data;
}

app.use(express.json());
app.use(express.static(siteDir));

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/subscribe', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address' });
    }

    const existing = db.exec('SELECT id FROM subscribers WHERE email = ?', [cleanEmail]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      return res.json({ success: true, message: 'Already subscribed' });
    }

    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    db.run('INSERT INTO subscribers (email, ip_address, user_agent) VALUES (?, ?, ?)',
      [cleanEmail, ipAddress, userAgent]);
    saveDatabase();

    const countResult = db.exec('SELECT COUNT(*) as count FROM subscribers');
    const count = countResult[0].values[0][0];

    // Send email in background (don't block response)
    console.log(`Attempting to send email for: ${cleanEmail}`);

    sendEmail({
      to: NOTIFY_EMAIL,
      subject: `New FormGhost Waitlist Signup (#${count})`,
      text: `New subscriber: ${cleanEmail}\nTotal: ${count}\nTime: ${new Date().toISOString()}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #1a1a1a; margin-bottom: 16px;">New FormGhost Waitlist Signup</h2>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
            <p style="margin: 0 0 8px 0; color: #525252;">Email:</p>
            <p style="margin: 0; font-size: 18px; color: #1a1a1a; font-weight: 500;">${cleanEmail}</p>
          </div>
          <p style="color: #737373; font-size: 14px;">
            Total subscribers: <strong>${count}</strong><br>
            Time: ${new Date().toLocaleString()}
          </p>
        </div>
      `
    }).then(result => {
      console.log('Email sent successfully:', result);
    }).catch(emailErr => {
      console.error('Email send failed:', emailErr.message);
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

app.get('*', (req, res) => {
  const ext = path.extname(req.path);
  if (ext && ext !== '.html') {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(siteDir, 'index.html'));
});

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`FormGhost running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
