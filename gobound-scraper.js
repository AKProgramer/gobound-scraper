const puppeteer = require('puppeteer');

async function scrape(url, opts = {}) {
  const {
    blockAssets = true,
    navTimeout = 60000,
    selectorTimeout = 15000,
    retries = 2,
  } = opts;

  const start = Date.now();

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1366, height: 900 });

    // This page is heavy (ads/analytics/images) and can hang or drop a
    // trailing request mid-navigation. Drop non-essential asset types and
    // wait only for the DOM (not full network idle) so a flaky ad/tracker
    // request can't abort the whole navigation with net::ERR_FAILED.
    if (blockAssets) {
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const type = req.resourceType();
        if (type === 'image' || type === 'media' || type === 'font') {
          req.abort();
        } else {
          req.continue();
        }
      });
    }

    let navError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout });
        navError = null;
        break;
      } catch (err) {
        navError = err;
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }
    if (navError) throw navError;

    // The rows are rendered client-side; wait for them, but don't blow up
    // on a legitimately empty schedule (e.g. no games on that date).
    try {
      await page.waitForSelector('tr.js-click-row', { timeout: selectorTimeout });
    } catch (_) {
      // no rows appeared in time — proceed and return whatever rendered
    }

    const html = await page.content();

    return {
      url,
      html,
      executionTime: Date.now() - start,
    };
  } finally {
    await browser.close();
  }
}

async function scrapeComp(url, opts = {}) {
  const {
    blockAssets = true,
    navTimeout = 120000,
    selectorTimeout = 60000,
    retries = 2,
  } = opts;

  const start = Date.now();

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1366, height: 900 });

    // This page is heavy (ads/analytics/images) and can hang on
    // networkidle. Drop non-essential asset types so the DOM we
    // actually need settles much faster.
    if (blockAssets) {
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const type = req.resourceType();
        if (type === 'image' || type === 'media' || type === 'font') {
          req.abort();
        } else {
          req.continue();
        }
      });
    }

    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout });
        await page.waitForSelector('.comp-header', { timeout: selectorTimeout });
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }
    if (lastError) throw lastError;

    const html = await page.content();

    return {
      url,
      html,
      executionTime: Date.now() - start,
    };
  } finally {
    await browser.close();
  }
}

module.exports = { scrape, scrapeComp };

if (require.main === module) {
  const main = async () => {
    const url = process.argv[2];
    const outIndex = process.argv.indexOf('--out');
    const outPath = outIndex !== -1 ? process.argv[outIndex + 1] : null;
    const noBlockAssets = process.argv.includes('--no-block-assets');

    if (!url) {
      console.error(
        'Usage: node gobound-scraper.js <gobound-url> [--out output.json] [--no-block-assets]\n' +
        '  Schedule/scores pages are scraped as a table.\n' +
        '  Pages containing "/comps/" are scraped as a single competition.'
      );
      process.exit(1);
    }

    const isComp = /\/comps\//.test(url);
    const data = isComp
      ? await scrapeComp(url, { blockAssets: !noBlockAssets })
      : await scrape(url, { blockAssets: !noBlockAssets });
    const json = JSON.stringify(data, null, 2);

    if (outPath) {
      require('fs').writeFileSync(outPath, json, 'utf8');
      console.error(`Saved HTML (${data.html.length} chars) to ${outPath}`);
    } else {
      console.log(json);
    }
  };

  main().catch((err) => {
    console.error('Scrape failed:', err);
    process.exit(1);
  });
}
