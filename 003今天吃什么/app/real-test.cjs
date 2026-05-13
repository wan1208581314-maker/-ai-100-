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
    const p = path.join(DIR, `real-${String(step).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: p });
    console.log(`  [${step}] ${name} -> ${p}`);
  }

  console.log('=== REAL PHOTO TEST ===\n');

  // Use a real photo from Downloads
  const realPhoto = 'C:\\Users\\DCKJ\\Downloads\\150c5ce4-067f-4516-8167-b7fd52824ba3.jpg';
  console.log(`Using real photo: ${realPhoto}\n`);

  // 1. Start at homepage
  console.log('--- 1. Homepage ---');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));
  await ss('homepage-start');

  // 2. Go to warehouse
  console.log('\n--- 2. Warehouse ---');
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent.trim() === '卡片仓库') { btn.click(); break; }
    }
  });
  await new Promise(r => setTimeout(r, 800));
  await ss('warehouse-start');

  // 3. Open card maker
  console.log('\n--- 3. Open Card Maker ---');
  await page.evaluate(() => {
    const grid = document.querySelector('.grid');
    if (grid && grid.lastElementChild) grid.lastElementChild.click();
  });
  await new Promise(r => setTimeout(r, 800));
  await ss('maker-open');

  // 4. Upload REAL photo
  console.log('\n--- 4. Upload Real Photo ---');
  const fi = await page.$('input[type="file"]');
  await fi.uploadFile(realPhoto);
  await new Promise(r => setTimeout(r, 1500));
  await ss('crop-screen');

  // 5. Confirm crop
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent.trim() === '确认') { btn.click(); break; }
    }
  });
  await new Promise(r => setTimeout(r, 1000));
  await ss('after-crop');

  // 6. Fill form
  console.log('\n--- 5. Fill Form ---');
  const nameInput = await page.$('input[type="text"]');
  if (nameInput) {
    await nameInput.type('美女');
  }
  await new Promise(r => setTimeout(r, 300));

  // Select category
  await page.evaluate(() => {
    const overlay = document.querySelector('[class*="fixed"][class*="inset-0"][class*="z-50"]');
    if (overlay) {
      const btns = overlay.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent.trim() === '轻食') { b.click(); break; }
      }
    }
  });
  await new Promise(r => setTimeout(r, 200));

  // Select tags
  await page.evaluate(() => {
    const overlay = document.querySelector('[class*="fixed"][class*="inset-0"][class*="z-50"]');
    if (overlay) {
      const btns = overlay.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent.trim() === '健康') { b.click(); break; }
      }
    }
  });
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => {
    const overlay = document.querySelector('[class*="fixed"][class*="inset-0"][class*="z-50"]');
    if (overlay) {
      const btns = overlay.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent.trim() === '清淡') { b.click(); break; }
      }
    }
  });
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => {
    const overlay = document.querySelector('[class*="fixed"][class*="inset-0"][class*="z-50"]');
    if (overlay) {
      const btns = overlay.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent.trim() === '快手') { b.click(); break; }
      }
    }
  });
  await new Promise(r => setTimeout(r, 300));
  await ss('maker-filled');

  // 7. Scroll down to see preview
  await page.evaluate(() => {
    const overlay = document.querySelector('[class*="fixed"][class*="inset-0"][class*="z-50"]');
    if (overlay) {
      const scrollable = overlay.querySelector('.overflow-y-auto');
      if (scrollable) scrollable.scrollTop = scrollable.scrollHeight;
    }
  });
  await new Promise(r => setTimeout(r, 500));
  await ss('maker-preview');

  // 8. Save
  console.log('\n--- 6. Save ---');
  await page.evaluate(() => {
    const overlay = document.querySelector('[class*="fixed"][class*="inset-0"][class*="z-50"]');
    if (overlay) {
      const btns = overlay.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent.includes('保存到仓库')) { b.click(); break; }
      }
    }
  });
  await new Promise(r => setTimeout(r, 1000));
  await ss('warehouse-with-custom');

  // 9. Detailed comparison in warehouse
  console.log('\n--- 7. Warehouse Detailed Comparison ---');
  const warehouseCompare = await page.evaluate(() => {
    const grid = document.querySelector('.grid');
    if (!grid) return null;
    const divs = grid.querySelectorAll(':scope > div');
    const results = { custom: null, builtins: [] };

    for (const div of divs) {
      const nameEl = div.querySelector('.font-black');
      if (nameEl && div.textContent.includes('美女')) {
        // Custom card
        const card = div.querySelector('.rounded-2xl');
        const img = div.querySelector('img');
        const tags = div.querySelectorAll('.rounded-full.font-bold');
        const cardRect = card ? card.getBoundingClientRect() : null;
        const imgRect = img ? img.getBoundingClientRect() : null;
        const cs = card ? window.getComputedStyle(card) : null;
        results.custom = {
          cardSize: cardRect ? `${Math.round(cardRect.width)}x${Math.round(cardRect.height)}` : null,
          imgSize: imgRect ? `${Math.round(imgRect.width)}x${Math.round(imgRect.height)}` : null,
          leftGap: imgRect && cardRect ? Math.round(imgRect.left - cardRect.left) : null,
          rightGap: imgRect && cardRect ? Math.round(cardRect.right - imgRect.right) : null,
          topGap: imgRect && cardRect ? Math.round(imgRect.top - cardRect.top) : null,
          bottomGap: imgRect && cardRect ? Math.round(cardRect.bottom - imgRect.bottom) : null,
          borderRadius: cs ? cs.borderRadius : null,
          overflow: cs ? cs.overflow : null,
          imgBorderRadius: img ? window.getComputedStyle(img).borderRadius : null,
          imgOverflow: img ? window.getComputedStyle(img).overflow : null,
          tags: Array.from(tags).map(t => ({
            text: t.textContent,
            fontSize: window.getComputedStyle(t).fontSize,
            fontWeight: window.getComputedStyle(t).fontWeight,
            color: window.getComputedStyle(t).color,
            bg: window.getComputedStyle(t).backgroundColor,
            padding: window.getComputedStyle(t).padding,
          })),
        };
      } else if (!nameEl && !div.querySelector('button') && div.querySelector('img')) {
        // Built-in card
        const card = div.querySelector('.rounded-2xl');
        const img = div.querySelector('img');
        const cardRect = card ? card.getBoundingClientRect() : null;
        const imgRect = img ? img.getBoundingClientRect() : null;
        const cs = card ? window.getComputedStyle(card) : null;
        if (results.builtins.length < 2) {
          results.builtins.push({
            cardSize: cardRect ? `${Math.round(cardRect.width)}x${Math.round(cardRect.height)}` : null,
            imgSize: imgRect ? `${Math.round(imgRect.width)}x${Math.round(imgRect.height)}` : null,
            leftGap: imgRect && cardRect ? Math.round(imgRect.left - cardRect.left) : null,
            rightGap: imgRect && cardRect ? Math.round(cardRect.right - imgRect.right) : null,
            borderRadius: cs ? cs.borderRadius : null,
            overflow: cs ? cs.overflow : null,
            imgBorderRadius: img ? window.getComputedStyle(img).borderRadius : null,
          });
        }
      }
    }
    return results;
  });
  console.log('Custom card:', JSON.stringify(warehouseCompare?.custom, null, 2));
  console.log('Built-in cards:', JSON.stringify(warehouseCompare?.builtins, null, 2));

  // 10. Go to homepage
  console.log('\n--- 8. Homepage with Custom Card ---');
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent.trim() === '首页') { btn.click(); break; }
    }
  });
  await new Promise(r => setTimeout(r, 1000));
  await ss('homepage-custom-card');

  // 11. Detailed comparison on homepage
  const homepageCompare = await page.evaluate(() => {
    const frames = document.querySelectorAll('.food-card-frame');
    const results = { custom: null, builtin: null };
    for (const f of frames) {
      if (f.textContent.includes('美女')) {
        const img = f.querySelector('img');
        const imgRect = img ? img.getBoundingClientRect() : null;
        const frameRect = f.getBoundingClientRect();
        const fcs = window.getComputedStyle(f);
        const ics = img ? window.getComputedStyle(img) : null;
        const tags = f.querySelectorAll('.rounded-full.font-bold');
        results.custom = {
          frameSize: `${Math.round(frameRect.width)}x${Math.round(frameRect.height)}`,
          imgSize: imgRect ? `${Math.round(imgRect.width)}x${Math.round(imgRect.height)}` : null,
          leftGap: imgRect ? Math.round(imgRect.left - frameRect.left) : null,
          rightGap: imgRect ? Math.round(frameRect.right - imgRect.right) : null,
          topGap: imgRect ? Math.round(imgRect.top - frameRect.top) : null,
          bottomGap: imgRect ? Math.round(frameRect.bottom - imgRect.bottom) : null,
          frameBorderRadius: fcs.borderRadius,
          frameOverflow: fcs.overflow,
          imgBorderRadius: ics ? ics.borderRadius : null,
          imgTransform: ics ? ics.transform : null,
          tags: Array.from(tags).map(t => ({
            text: t.textContent,
            fontSize: window.getComputedStyle(t).fontSize,
            color: window.getComputedStyle(t).color,
            bg: window.getComputedStyle(t).backgroundColor,
          })),
        };
      } else if (!f.textContent.includes('美女') && !results.builtin) {
        const img = f.querySelector('img');
        if (img) {
          const imgRect = img.getBoundingClientRect();
          const frameRect = f.getBoundingClientRect();
          const fcs = window.getComputedStyle(f);
          const ics = window.getComputedStyle(img);
          results.builtin = {
            frameSize: `${Math.round(frameRect.width)}x${Math.round(frameRect.height)}`,
            imgSize: `${Math.round(imgRect.width)}x${Math.round(imgRect.height)}`,
            leftGap: Math.round(imgRect.left - frameRect.left),
            rightGap: Math.round(frameRect.right - imgRect.right),
            topGap: Math.round(imgRect.top - frameRect.top),
            bottomGap: Math.round(frameRect.bottom - imgRect.bottom),
            frameBorderRadius: fcs.borderRadius,
            frameOverflow: fcs.overflow,
            imgBorderRadius: ics.borderRadius,
            imgTransform: ics.transform,
          };
        }
      }
    }
    return results;
  });
  console.log('Custom card:', JSON.stringify(homepageCompare?.custom, null, 2));
  console.log('Built-in card:', JSON.stringify(homepageCompare?.builtin, null, 2));

  // 12. Navigate to show custom card in center
  console.log('\n--- 9. Navigate to Custom Card Center ---');
  // Click right arrow a few times to get to the custom card
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const btn of btns) {
        const rect = btn.getBoundingClientRect();
        if (rect.right > 350 && rect.top > 200 && rect.top < 400) {
          btn.click();
          break;
        }
      }
    });
    await new Promise(r => setTimeout(r, 300));
  }
  await new Promise(r => setTimeout(r, 800));
  await ss('homepage-custom-center');

  // Check if custom card is now in center
  const isCenter = await page.evaluate(() => {
    const frames = document.querySelectorAll('.food-card-frame');
    for (const f of frames) {
      if (f.textContent.includes('美女')) {
        const rect = f.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        return { centerX: Math.round(centerX), cardLeft: Math.round(rect.left), cardRight: Math.round(rect.right) };
      }
    }
    return null;
  });
  console.log('Custom card position:', isCenter);

  // 13. Cleanup
  console.log('\n--- 10. Cleanup ---');
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent.trim() === '卡片仓库') { btn.click(); break; }
    }
  });
  await new Promise(r => setTimeout(r, 600));
  await page.evaluate(() => {
    const grid = document.querySelector('.grid');
    if (!grid) return;
    const divs = grid.querySelectorAll(':scope > div');
    for (const div of divs) {
      if (div.textContent.includes('美女')) {
        const delBtn = div.querySelector('button');
        if (delBtn) delBtn.click();
      }
    }
  });
  await new Promise(r => setTimeout(r, 400));
  await ss('cleanup-done');

  console.log('\n=== TEST COMPLETE ===');
  console.log('Browser staying open for manual inspection.');
})();
