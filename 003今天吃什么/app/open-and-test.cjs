const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIR = path.join(__dirname, '.claude', 'qa');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    args: ['--no-sandbox', '--window-size=390,844', '--window-position=200,100'],
    defaultViewport: { width: 390, height: 844 },
  });
  const page = await browser.newPage();
  let step = 0;
  async function ss(name) {
    step++;
    await page.screenshot({ path: path.join(DIR, `live-${String(step).padStart(2, '0')}-${name}.png`) });
    console.log(`  [${step}] ${name}`);
  }

  console.log('=== LIVE TEST ===\n');

  // 1. Homepage
  console.log('--- 1. Homepage ---');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  await ss('homepage');
  console.log('  Homepage loaded');

  // 2. Warehouse - check current cards
  console.log('\n--- 2. Warehouse ---');
  await page.evaluate(() => { const btns = document.querySelectorAll('button'); for (const btn of btns) { if (btn.textContent.trim() === '卡片仓库') { btn.click(); break; } } });
  await new Promise(r => setTimeout(r, 500));
  await ss('warehouse');

  // Check if there are existing custom cards
  const existingCustom = await page.evaluate(() => {
    const grid = document.querySelector('.grid');
    if (!grid) return [];
    const divs = grid.querySelectorAll(':scope > div');
    const customs = [];
    for (const div of divs) {
      const nameEl = div.querySelector('.font-black');
      if (nameEl && div.querySelector('button')) {
        customs.push(nameEl.textContent);
      }
    }
    return customs;
  });
  console.log(`  Existing custom cards: ${existingCustom.length > 0 ? existingCustom.join(', ') : 'none'}`);

  // 3. Create new custom card
  console.log('\n--- 3. Create Custom Card ---');
  await page.evaluate(() => { const grid = document.querySelector('.grid'); if (grid) grid.lastElementChild.click(); });
  await new Promise(r => setTimeout(r, 500));

  // Upload
  const fi = await page.$('input[type="file"]');
  await fi.uploadFile(path.join(__dirname, 'public', 'images', '08-huoguo.png'));
  await new Promise(r => setTimeout(r, 1000));
  await ss('crop-editor');

  // Crop
  await page.evaluate(() => { const btns = document.querySelectorAll('button'); for (const btn of btns) { if (btn.textContent.trim() === '确认') { btn.click(); break; } } });
  await new Promise(r => setTimeout(r, 500));

  // Fill form
  const ni = await page.$('input[type="text"]');
  await ni.type('测试火锅');
  await page.evaluate(() => { const o = document.querySelector('[class*="fixed"][class*="inset-0"][class*="z-50"]'); if (o) { const bs = o.querySelectorAll('button'); for (const b of bs) { if (b.textContent.trim() === '家常') { b.click(); break; } } } });
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => { const o = document.querySelector('[class*="fixed"][class*="inset-0"][class*="z-50"]'); if (o) { const bs = o.querySelectorAll('button'); for (const b of bs) { if (b.textContent.trim() === '热乎') { b.click(); break; } } } });
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => { const o = document.querySelector('[class*="fixed"][class*="inset-0"][class*="z-50"]'); if (o) { const bs = o.querySelectorAll('button'); for (const b of bs) { if (b.textContent.trim() === '聚餐') { b.click(); break; } } } });
  await new Promise(r => setTimeout(r, 300));
  await ss('maker-filled');

  // Save
  await page.evaluate(() => { const o = document.querySelector('[class*="fixed"][class*="inset-0"][class*="z-50"]'); if (o) { const bs = o.querySelectorAll('button'); for (const b of bs) { if (b.textContent.includes('保存到仓库')) { b.click(); break; } } } });
  await new Promise(r => setTimeout(r, 800));
  await ss('warehouse-with-new');

  // 4. Compare warehouse vs homepage
  console.log('\n--- 4. Compare ---');

  // Check warehouse custom card dimensions
  const warehouseInfo = await page.evaluate(() => {
    const grid = document.querySelector('.grid');
    if (!grid) return null;
    const divs = grid.querySelectorAll(':scope > div');
    for (const div of divs) {
      if (div.textContent.includes('测试火锅')) {
        const img = div.querySelector('img');
        if (img) {
          const rect = img.getBoundingClientRect();
          return { imgW: rect.width, imgH: rect.height, src: img.src.substring(0, 50) };
        }
      }
    }
    return null;
  });
  console.log(`  Warehouse custom card img:`, warehouseInfo);

  // Go to homepage and check
  await page.evaluate(() => { const btns = document.querySelectorAll('button'); for (const btn of btns) { if (btn.textContent.trim() === '首页') { btn.click(); break; } } });
  await new Promise(r => setTimeout(r, 800));
  await ss('homepage-with-custom');

  const homepageInfo = await page.evaluate(() => {
    const frames = document.querySelectorAll('.food-card-frame');
    for (const f of frames) {
      if (f.textContent.includes('测试火锅')) {
        const img = f.querySelector('img');
        if (img) {
          const rect = img.getBoundingClientRect();
          return { imgW: rect.width, imgH: rect.height, src: img.src.substring(0, 50) };
        }
      }
    }
    return null;
  });
  console.log(`  Homepage custom card img:`, homepageInfo);

  // Cleanup
  console.log('\n--- 5. Cleanup ---');
  await page.evaluate(() => { const btns = document.querySelectorAll('button'); for (const btn of btns) { if (btn.textContent.trim() === '卡片仓库') { btn.click(); break; } } });
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => { const btns = document.querySelectorAll('button'); for (const btn of btns) { const s = window.getComputedStyle(btn); if (s.backgroundColor && s.backgroundColor.includes('220') && s.backgroundColor.includes('60')) { btn.click(); break; } } });
  await new Promise(r => setTimeout(r, 300));
  await ss('warehouse-after-cleanup');

  console.log('\n=== LIVE TEST COMPLETE ===');
  console.log('Browser staying open for inspection. Press Ctrl+C to close.');
})();
