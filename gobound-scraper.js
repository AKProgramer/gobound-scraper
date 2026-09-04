const puppeteer = require('puppeteer');

// Runs inside the page — DOM equivalent of the cheerio `extract()` function.
function extractGames() {
  const rows = Array.from(document.querySelectorAll('tr.js-click-row'));

  return rows.map((row) => {
    const id = row.getAttribute('data-id') || '';

    const linkEl = row.querySelector('td.td-hidden-link a');
    const relativeUrl = linkEl ? linkEl.getAttribute('href') || '' : '';
    const gameUrl = relativeUrl ? 'https://www.gobound.com' + relativeUrl : '';

    const eventCell = row.querySelector('td.pl-3');
    const teams = [];
    if (eventCell) {
      eventCell.querySelectorAll('span').forEach((span) => {
        const text = span.textContent.replace(/\s+/g, ' ').trim();
        if (text && text.toLowerCase() !== 'vs.') teams.push(text);
      });
    }
    const homeTeam = teams[0] || '';
    const awayTeam = teams[1] || '';

    const cells = row.querySelectorAll('td');
    const cellText = (i) =>
      cells[i] ? cells[i].textContent.replace(/\s+/g, ' ').trim() : '';

    const location = cellText(2);
    const time = cellText(3);
    const result = cellText(4);

    const ticketEl = row.querySelector('a[href*="/tickets"]');
    const ticketUrl = ticketEl ? ticketEl.getAttribute('href') || '' : '';

    return {
      id,
      homeTeam,
      awayTeam,
      location,
      time,
      result,
      gameUrl,
      ticketUrl,
      scrapedAt: new Date().toISOString(),
    };
  });
}

async function scrape(url) {
  const start = Date.now();

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1366, height: 900 });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // The rows are rendered client-side; wait for them, but don't blow up
    // on a legitimately empty schedule (e.g. no games on that date).
    try {
      await page.waitForSelector('tr.js-click-row', { timeout: 15000 });
    } catch (_) {
      // no rows appeared in time — proceed and return an empty list
    }

    const items = await page.evaluate(extractGames);

    return {
      url,
      items,
      count: items.length,
      executionTime: Date.now() - start,
    };
  } finally {
    await browser.close();
  }
}

module.exports = { scrape };

if (require.main === module) {
  const main = async () => {
    const url = process.argv[2];
    const outIndex = process.argv.indexOf('--out');
    const outPath = outIndex !== -1 ? process.argv[outIndex + 1] : null;

    if (!url) {
      console.error('Usage: node gobound-scraper.js <gobound-scores-url> [--out output.json]');
      process.exit(1);
    }

    const data = await scrape(url);
    const json = JSON.stringify(data, null, 2);

    if (outPath) {
      require('fs').writeFileSync(outPath, json, 'utf8');
      console.error(`Saved ${data.count} item(s) to ${outPath}`);
    } else {
      console.log(json);
    }
  };

  main().catch((err) => {
    console.error('Scrape failed:', err);
    process.exit(1);
  });
}
