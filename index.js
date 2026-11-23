const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory store (resets on restart/spin-down; fine for starting out)
const messages = [];

function getConfiguredNumbers() {
  const raw = process.env.PHONE_NUMBERS || '+17372508034';
  return raw
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
}

function extractCode(text = '') {
  const match = text.match(/\b(\d{4,8})\b/);
  return match ? match[1] : null;
}

function pushMessage(record) {
  messages.unshift(record);
  if (messages.length > 300) {
    messages.pop();
  }
}

app.get('/api/health', (req, res) => {
  const numbers = getConfiguredNumbers();
  res.json({
    ok: true,
    service: 'TempLine SMS',
    configuredNumbersCount: numbers.length,
    totalMessages: messages.length,
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    ok: true,
    phoneNumbers: getConfiguredNumbers(),
  });
});

// Inbound SMS webhook (Twilio / SMS gateway)
app.post('/webhooks/sms', (req, res) => {
  const payload = req.body || {};
  const from = (payload.From || payload.from || 'Unknown').toString().trim();
  const to = (
    payload.To ||
    payload.to ||
    getConfiguredNumbers()[0] ||
    '+17372508034'
  )
    .toString()
    .trim();
  const body = (payload.Body || payload.body || payload.text || '').toString();
  const code = extractCode(body);

  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    channel: 'sms',
    from,
    to,
    subject: 'SMS Message',
    body,
    code,
    receivedAt: new Date().toISOString(),
  };

  pushMessage(record);

  // Return empty TwiML so Twilio treats webhook as acknowledged cleanly
  res.type('text/xml').status(200).send('<Response></Response>');
});

// Inbound Email webhook (Email Worker / mail-to-webhook provider)
app.post('/webhooks/email', (req, res) => {
  const payload = req.body || {};
  const from = (payload.from || payload.sender || 'unknown@sender.com')
    .toString()
    .trim();
  const to = (payload.to || payload.recipient || '')
    .toString()
    .trim()
    .toLowerCase();
  const subject = (payload.subject || '(No Subject)').toString();
  const body = (payload.text || payload.body || payload.html || '').toString();
  const code = extractCode(`${subject} ${body}`);

  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    channel: 'email',
    from,
    to,
    subject,
    body,
    code,
    receivedAt: new Date().toISOString(),
  };

  pushMessage(record);
  res.status(200).json({ ok: true, id: record.id });
});

app.get('/api/messages', (req, res) => {
  const channel = (req.query.channel || '').toString().trim().toLowerCase();
  const recipient = (
    req.query.recipient ||
    req.query.to ||
    req.query.phone ||
    ''
  )
    .toString()
    .trim()
    .toLowerCase();

  const filtered = messages.filter((m) => {
    const msgChannel = m.channel || 'sms';
    if (channel && msgChannel !== channel) return false;
    if (recipient && !(m.to || '').toLowerCase().includes(recipient)) {
      return false;
    }
    return true;
  });

  res.json({ messages: filtered });
});

app.listen(PORT, () => {
  console.log(`TempLine unified server listening on port ${PORT}`);
});
