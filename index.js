const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const baseNumbers = (process.env.PHONE_NUMBERS || '+15550109921,+447700900412')
  .split(',')
    .map((n) => n.trim())
      .filter(Boolean);

      function buildNumbersList(minCount = 50) {
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
                                                  candidate = `+91980000${suffix}`;
                                                      }

                                                          if (!list.includes(candidate)) {
                                                                list.push(candidate);
                                                                    }
                                                                        counter += 1;
                                                                          }

                                                                            return list;
                                                                            }

                                                                            const configuredNumbers = buildNumbersList(50);

                                                                            // Simple in-memory API keys & usage tracker (swap for a database in production)
                                                                            const apiKeys = new Map([
                                                                              [
                                                                                  process.env.DEMO_API_KEY || 'demo-key-123',
                                                                                      { label: 'Starter Demo Key', plan: 'Free', requests: 0, limit: 100 },
                                                                                        ],
                                                                                        ]);

                                                                                        function trackApiKey(req, res, next) {
                                                                                          const providedKey = req.header('x-api-key') || req.query.apiKey;
                                                                                            if (!providedKey) {
                                                                                                return next(); // Allow browser UI calls without a key; track keyed API calls
                                                                                                  }

                                                                                                    const record = apiKeys.get(providedKey);
                                                                                                      if (!record) {
                                                                                                          return res.status(401).json({ error: 'Invalid API key' });
                                                                                                            }

                                                                                                              if (record.requests >= record.limit) {
                                                                                                                  return res.status(429).json({ error: 'Usage limit reached for this API key' });
                                                                                                                    }

                                                                                                                      record.requests += 1;
                                                                                                                        req.apiKeyInfo = { key: providedKey, ...record };
                                                                                                                          next();
                                                                                                                          }

                                                                                                                          const messages = [
                                                                                                                            {
                                                                                                                                id: 'msg-1',
                                                                                                                                    to: configuredNumbers[0] || '+15550109921',
                                                                                                                                        from: 'Google',
                                                                                                                                            body: 'G-482910 is your Google verification code.',
                                                                                                                                                otp: '482910',
                                                                                                                                                    receivedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
                                                                                                                                                      },
                                                                                                                                                        {
                                                                                                                                                            id: 'msg-2',
                                                                                                                                                                to: configuredNumbers[1] || '+447700900412',
                                                                                                                                                                    from: 'TempLineTest',
                                                                                                                                                                        body: 'Your verification code is 392639.',
                                                                                                                                                                            otp: '392639',
                                                                                                                                                                                receivedAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
                                                                                                                                                                                  },
                                                                                                                                                                                  ];

                                                                                                                                                                                  function extractOtp(text = '') {
                                                                                                                                                                                    const match = text.match(/\b(\d{4,8})\b/);
                                                                                                                                                                                      return match ? match[1] : null;
                                                                                                                                                                                      }

                                                                                                                                                                                      function saveMessage({ to, from, body }) {
                                                                                                                                                                                        const targetNumber = to || configuredNumbers[0] || '+15550109921';
                                                                                                                                                                                          const entry = {
                                                                                                                                                                                              id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                                                                                                                                                                                                  to: targetNumber,
                                                                                                                                                                                                      from: from || 'UnknownSender',
                                                                                                                                                                                                          body: body || '',
                                                                                                                                                                                                              otp: extractOtp(body || ''),
                                                                                                                                                                                                                  receivedAt: new Date().toISOString(),
                                                                                                                                                                                                                    };
                                                                                                                                                                                                                      messages.unshift(entry);
                                                                                                                                                                                                                        return entry;
                                                                                                                                                                                                                        }

                                                                                                                                                                                                                        app.get('/api/health', (req, res) => {
                                                                                                                                                                                                                          res.json({
                                                                                                                                                                                                                              ok: true,
                                                                                                                                                                                                                                  service: 'TempLine SMS',
                                                                                                                                                                                                                                      configuredNumbersCount: configuredNumbers.length,
                                                                                                                                                                                                                                          totalMessages: messages.length,
                                                                                                                                                                                                                                            });
                                                                                                                                                                                                                                            });

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

                                                                                                                                                                                                                                                                      app.get('/api/numbers', trackApiKey, (req, res) => {
                                                                                                                                                                                                                                                                        res.json({
                                                                                                                                                                                                                                                                            numbers: configuredNumbers.map((num, index) => ({
                                                                                                                                                                                                                                                                                  number: num,
                                                                                                                                                                                                                                                                                        country: num.startsWith('+44') ? 'UK' : num.startsWith('+91') ? 'IN' : 'US',
                                                                                                                                                                                                                                                                                              status: index < 2 ? 'Expires soon' : 'Online',
                                                                                                                                                                                                                                                                                                  })),
                                                                                                                                                                                                                                                                                                    });
                                                                                                                                                                                                                                                                                                    });

                                                                                                                                                                                                                                                                                                    app.get('/api/messages', trackApiKey, (req, res) => {
                                                                                                                                                                                                                                                                                                      const number = req.query.number;
                                                                                                                                                                                                                                                                                                        const filtered = number
                                                                                                                                                                                                                                                                                                            ? messages.filter((m) => m.to === number)
                                                                                                                                                                                                                                                                                                                : messages;
                                                                                                                                                                                                                                                                                                                  res.json({ messages: filtered });
                                                                                                                                                                                                                                                                                                                  });

                                                                                                                                                                                                                                                                                                                  app.get('/api/messages/:number', trackApiKey, (req, res) => {
                                                                                                                                                                                                                                                                                                                    const target = decodeURIComponent(req.params.number);
                                                                                                                                                                                                                                                                                                                      const filtered = messages.filter((m) => m.to === target);
                                                                                                                                                                                                                                                                                                                        res.json({ messages: filtered });
                                                                                                                                                                                                                                                                                                                        });

                                                                                                                                                                                                                                                                                                                        app.post('/api/messages/simulate', trackApiKey, (req, res) => {
                                                                                                                                                                                                                                                                                                                          const { to, from, body } = req.body || {};
                                                                                                                                                                                                                                                                                                                            if (!body || !String(body).trim()) {
                                                                                                                                                                                                                                                                                                                                return res.status(400).json({ error: 'Message body is required' });
                                                                                                                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                                                                                                                    const saved = saveMessage({ to, from, body: String(body).trim() });
                                                                                                                                                                                                                                                                                                                                      res.status(201).json({ message: saved });
                                                                                                                                                                                                                                                                                                                                      });

                                                                                                                                                                                                                                                                                                                                      app.post('/webhooks/sms', trackApiKey, (req, res) => {
                                                                                                                                                                                                                                                                                                                                        const from = req.body.From || req.body.from || req.body.sender;
                                                                                                                                                                                                                                                                                                                                          const to = req.body.To || req.body.to || req.body.recipient;
                                                                                                                                                                                                                                                                                                                                            const body = req.body.Body || req.body.body || req.body.text || req.body.message;

                                                                                                                                                                                                                                                                                                                                              if (!body || !String(body).trim()) {
                                                                                                                                                                                                                                                                                                                                                  return res.status(400).json({ error: 'SMS body is required' });
                                                                                                                                                                                                                                                                                                                                                    }

                                                                                                                                                                                                                                                                                                                                                      const saved = saveMessage({ to, from, body: String(body).trim() });
                                                                                                                                                                                                                                                                                                                                                        res.status(201).json({ ok: true, message: saved });
                                                                                                                                                                                                                                                                                                                                                        });

                                                                                                                                                                                                                                                                                                                                                        app.listen(PORT, () => {
                                                                                                                                                                                                                                                                                                                                                          console.log(`TempLine server running on port ${PORT}`);
                                                                                                                                                                                                                                                                                                                                                          });
                                                                                                                                                                                                                                                                                                                                       