const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const messages = [];
const seenIds = new Set();

function getConfiguredNumbers() {
  const raw = process.env.PHONE_NUMBERS || '+17372508034';
  return raw
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
}

function firstString(val, fallback = '') {
  if (Array.isArray(val)) {
    const found = val.find((item) => typeof item === 'string' && item.trim());
    return found ? found.trim() : fallback;
  }
  if (typeof val === 'string' && val.trim()) {
    return val.trim();
  }
  return fallback;
}

function stripHtml(html = '') {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCode(text = '') {
  const cleaned = String(text);
  const contextual = cleaned.match(
    /(?:otp|code|verify|verification|pin|passcode)[^0-9]{0,15}(\d{4,8})\b/i
  );
  if (contextual) return contextual[1];

  const fallback = cleaned.match(/\b(\d{4,8})\b/);
  return fallback ? fallback[1] : null;
}

function pushMessage(record) {
  if (record.dedupeKey) {
    if (seenIds.has(record.dedupeKey)) return false;
    seenIds.add(record.dedupeKey);
    if (seenIds.size > 1000) {
      const oldest = seenIds.values().next().value;
      seenIds.delete(oldest);
    }
  }
  messages.unshift(record);
  if (messages.length > 300) {
    messages.pop();
  }
  return true;
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

app.post('/webhooks/sms', (req, res) => {
  const payload = req.body || {};
  const from = firstString(payload.From || payload.from, 'Unknown');
  const to = firstString(
    payload.To || payload.to,
    getConfiguredNumbers()[0] || '+17372508034'
  );
  const body = (payload.Body || payload.body || payload.text || '').toString();
  const code = extractCode(body);

  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    dedupeKey: null,
    channel: 'sms',
    from,
    to,
    subject: 'SMS Message',
    body,
    code,
    receivedAt: new Date().toISOString(),
  };

  pushMessage(record);
  res.type('text/xml').status(200).send('<Response></Response>');
});

app.post('/webhooks/email', (req, res) => {
  const payload = req.body || {};
  const data =
    payload.message && typeof payload.message === 'object'
      ? payload.message
      : payload.data && typeof payload.data === 'object'
      ? payload.data
      : payload;

  const to = firstString(
    data.to || data.recipient || data.email || data.inbox_id || payload.inbox_id,
    ''
  ).toLowerCase();

  const from = firstString(
    data.from_ || data.from || data.sender,
    'unknown@sender.com'
  );

  const subject = firstString(data.subject, '(No Subject)');

  const plainText = (
    data.text ||
    data.extracted_text ||
    data.preview ||
    data['body-plain'] ||
    ''
  )
    .toString()
    .trim();

  const htmlText = stripHtml(
    data.html || data.extracted_html || data['body-html'] || ''
  );

  const body =
    plainText ||
    htmlText ||
    (typeof data.body === 'string' ? data.body.trim() : '') ||
    '(Empty message body)';

  const code = extractCode(`${subject} ${body}`);

  const eventOrMsgId = firstString(
    payload.event_id || data.message_id || data.id,
    ''
  );

  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    dedupeKey: eventOrMsgId ? `email:${eventOrMsgId}` : null,
    channel: 'email',
    from,
    to,
    subject,
    body,
    code,
    receivedAt:
      firstString(data.timestamp || payload.timestamp, '') ||
      new Date().toISOString(),
  };

  const added = pushMessage(record);
  res.status(200).json({ ok: true, id: record.id, deduplicated: !added, code });
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
