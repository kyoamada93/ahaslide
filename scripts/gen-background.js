// Renders scripts/gen-background.html to public/assets/bg.jpg (16:9) and bg-mobile.jpg (9:16).
// Usage: node scripts/gen-background.js   (needs playwright + chromium)
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const src = 'file://' + path.join(__dirname, 'gen-background.html');
  const out = path.join(__dirname, '..', 'public', 'assets');
  for (const [name, w, h, seed] of [['bg.jpg', 1920, 1080, 7], ['bg-mobile.jpg', 1080, 1920, 11]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${src}?w=${w}&h=${h}&seed=${seed}`);
    await page.waitForFunction(() => document.title === 'done');
    await page.screenshot({ path: path.join(out, name), type: 'jpeg', quality: 86 });
    console.log('wrote', name);
  }
  await browser.close();
})();
