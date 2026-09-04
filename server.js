require('dotenv').config();
const express = require('express');
const { scrape } = require('./gobound-scraper');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.SCRAPER_API_KEY;

if (!API_KEY) {
  console.error('SCRAPER_API_KEY is not set in .env — refusing to start.');
  process.exit(1);
}

function requireApiKey(req, res, next) {
  const key = req.get('x-api-key') || req.query.apiKey;
  if (key !== API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  next();
}

// Serialize scrape calls: each one launches a full Chromium instance,
// so running many at once would be expensive and easy to abuse.
let queue = Promise.resolve();
function enqueue(task) {
  const result = queue.then(task, task);
  queue = result.catch(() => {});
  return result;
}

app.get('/scrape', requireApiKey, async (req, res) => {
  const url = req.query.url;

  if (!url || !/^https:\/\/www\.gobound\.com\//.test(url)) {
    return res.status(400).json({ error: 'Provide a valid "url" query param pointing to a gobound.com page' });
  }

  try {
    const data = await enqueue(() => scrape(url));
    res.json(data);
  } catch (err) {
    console.error('Scrape failed:', err);
    res.status(502).json({ error: 'Scrape failed', message: err.message });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Gobound scraper API listening on http://localhost:${PORT}`);
});
