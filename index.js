const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Normalize phone numbers so "+1 555-010-9921" and "15550109921" always match
function normalizePhone(raw = '') {
  const cleaned = String(raw).trim().replace(/[^\d+]/g, '');
  if (!cleaned) return '';
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

// Real numbers from Render environment variable PHONE_NUMBERS (comma-separated)
const baseNumbers = (process.env.PHONE_NUMBERS || '+15550109921')
  .split(',')
  .map((n) => normalizePhone(n))
  .filter(Boolean);

// Only list configured real numbers by default so visitors only see active numbers.
// Pass ?fill=50 if you ever want placeholder numbers padded for UI testing.
function getAvailableNumbers(minCount = 0) {
  const list = [...baseNumbers];
  let counter = 1;

  while (list.length < minCount) {
    const suffix = String(counter).padStart(4, '0');
    let candidate;

    if (counter % 3 === 1) {
      candidate = `+1555010${suffix}`;
    } else if (counter % 3 === 2) {
      candidate = `+44770090${suffix}`;
    } else {
      candidate = `+91987654${suffix}`;
    }

    if (!list.includes(candidate)) {
      list.push(candidate);
    }
    counter += 1;
  }

  return list;
}

const configuredNumbers = getAvailableNumbers(0);

// Optional API key tracking (kept for /api/usage and protected admin routes)
const apiKeys = new Map([
  [
    process.env.ADMIN_API_KEY || 'demo-public-key',
    { label: 'Default Key', plan: 'Free', requests: 0, limit: 10000 },
  ],
]);

function trackApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.apiKey;
  if (key && apiKeys.has(key)) {
    const info = apiKeys.get(key);
    info.requests += 1;
  }
  next();
}

// In-memory message store (newest first)
const messages = [
  {
    id: 'msg-welcome-1',
    to: configuredNumbers[0] || '+15550109921',
    from: 'TempLine',
    body: 'Welcome! Your TempLine SMS inbox is live. Send an OTP to this number to test.',
    otp: null,
    receivedAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
  },
];

function extractOtp(text = '') {
  const match = String(text).match(/\b(\d{4,8})\b/);
  return match ? match[1] : null;
}

function saveMessage({ to, from, body }) {
  const normalizedTo = normalizePhone(to);
  const targetNumber =
    normalizedTo ||
    normalizePhone(configuredNumbers[0]) ||
    '+15550109921';

  const cleanBody = String(body || '').trim();

  const entry = {
    id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    to: targetNumber,
    from: String(from || 'UnknownSender').trim(),
    body: cleanBody,
    otp: extractOtp(cleanBody),
    receivedAt: new Date().toISOString(),
  };

  messages.unshift(entry);

  // Keep memory bounded on free Render instances
  if (messages.length > 500) {
    messages.length = 500;
  }

  return entry;
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'TempLine SMS',
    configuredNumbersCount: configuredNumbers.length,
    totalMessages: messages.length,
  });
});

// API key usage stats
app.get('/api/usage', (req, res) => {
  const keys = Array.from(apiKeys.entries()).map(([key, info]) => ({
    keyPreview: `${key.slice(0, 6)}...`,
    label: info.label,
    plan: info.plan,
    requests: info.requests,
    limit: info.limit,
  }));
  res.json({ keys });
});

// Public list of virtual numbers (no API key required)
app.get('/api/numbers', (req, res) => {
  const fillCount = Number(req.query.fill) || 0;
  const numbersList = getAvailableNumbers(fillCount);

  res.json({
    numbers: numbersList.map((num, index) => ({
      number: num,
      country: num.startsWith('+44')
        ? 'UK'
        : num.startsWith('+91')
        ? 'IN'
        : 'US',
      status: index < baseNumbers.length ? 'Online' : 'Demo',
    })),
  });
});

// Public messages feed (optional ?number=... filter)
app.get('/api/messages', (req, res) => {
  const target = normalizePhone(req.query.number);
  const filtered = target
    ? messages.filter((m) => normalizePhone(m.to) === target)
    : messages;
  res.json({ messages: filtered });
});

// Public inbox for a specific number
app.get('/api/messages/:number', (req, res) => {
  const target = normalizePhone(decodeURIComponent(req.params.number));
  const filtered = messages.filter((m) => normalizePhone(m.to) === target);
  res.json({ messages: filtered });
});

// Manual simulation endpoint for quick browser/API testing
app.post('/api/messages/simulate', trackApiKey, (req, res) => {
  const { to, from, body } = req.body || {};
  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: 'Message body is required' });
  }
  const saved = saveMessage({ to, from, body: String(body) });
  res.status(201).json({ message: saved });
});

// Public SMS Webhook Receiver (Twilio / SMS providers POST here without an API key)
app.post('/webhooks/sms', (req, res) => {
  const payload = req.body || {};
  const from = payload.From || payload.from || payload.sender;
  const to = payload.To || payload.to || payload.recipient;
  const body = payload.Body || payload.body || payload.text || payload.message;

  if (!body || !String(body).trim()) {
    return res.status(400).type('text/xml').send('<Response></Response>');
  }

  saveMessage({ to, from, body: String(body) });

  // Return 200 TwiML/XML so Twilio and standard SMS webhooks confirm delivery
  return res.status(200).type('text/xml').send('<Response></Response>');
});

// Fallback to frontend index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`TempLine SMS server running on port ${PORT}`);
});
