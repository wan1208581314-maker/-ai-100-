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
    const p = path.join(DIR, `live-${String(step).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: p });
    console.log(`  [${step}] ${name} -> ${p}`);
  }

  console.log('=== LIVE TEST - Full Comparison ===\n');

  // 1. Homepage first
  console.log('--- 1. Homepage (built-in cards) ---');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));
  await ss('homepage-builtin');

  // 2. Go to warehouse
  console.log('\n--- 2. Warehouse (built-in cards) ---');
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent.trim() === '卡片仓库') { btn.click(); break; }
    }
  });
  await new Promise(r => setTimeout(r, 800));
  await ss('warehouse-builtin');

  // 3. Create new custom card with REAL image (not template)
  console.log('\n--- 3. Create Custom Card ---');
  // Click the "+" add button (last element in grid)
  await page.evaluate(() => {
    const grid = document.querySelector('.grid');
    if (grid && grid.lastElementChild) grid.lastElementChild.click();
  });
  await new Promise(r => setTimeout(r, 800));

  // Upload a REAL photo (use the hotpot image as a test, but from a different source)
  // Let's use one of the food images that's NOT in the built-in set
  // Actually let's find any image in public/images
  const fs = require('fs');
  const imagesDir = path.join(__dirname, 'public', 'images');
  const allImages = fs.readdirSync(imagesDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
  console.log(`  Available images: ${allImages.join(', ')}`);

  // Use the first image as our "uploaded" photo
  const testImage = path.join(imagesDir, allImages[0]);
  console.log(`  Uploading: ${testImage}`);

  const fi = await page.$('input[type="file"]');
  await fi.uploadFile(testImage);
  await new Promise(r => setTimeout(r, 1500));
  await ss('crop-screen');

  // Confirm crop
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent.trim() === '确认') { btn.click(); break; }
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  // Fill name
  const nameInput = await page.$('input[type="text"]');
  if (nameInput) {
    await nameInput.type('测试菜品');
  }
  await new Promise(r => setTimeout(r, 300));

  // Select category "家常"
  await page.evaluate(() => {
    const overlay = document.querySelector('[class*="fixed"][class*="inset-0"][class*="z-50"]');
    if (overlay) {
      const btns = overlay.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent.trim() === '家常') { b.click(); break; }
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
        if (b.textContent.trim() === '下饭') { b.click(); break; }
      }
    }
  });
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => {
    const overlay = document.querySelector('[class*="fixed"][class*="inset-0"][class*="z-50"]');
    if (overlay) {
      const btns = overlay.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent.trim() === '家常菜') { b.click(); break; }
      }
    }
  });
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => {
    const overlay = document.querySelector('[class*="fixed"][class*="inset-0"][class*="z-50"]');
    if (overlay) {
      const btns = overlay.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent.trim() === '香辣') { b.click(); break; }
      }
    }
  });
  await new Promise(r => setTimeout(r, 300));
  await ss('maker-filled');

  // 4. Check the preview card in maker
  console.log('\n--- 4. Maker Preview ---');
  await ss('maker-preview');

  // 5. Save
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

  // 6. Measure warehouse custom card dimensions
  console.log('\n--- 5. Warehouse Custom Card Analysis ---');
  const warehouseData = await page.evaluate(() => {
    const grid = document.querySelector('.grid');
    if (!grid) return null;
    const divs = grid.querySelectorAll(':scope > div');
    const results = { custom: null, builtin: null };
    for (const div of divs) {
      const nameEl = div.querySelector('.font-black');
      if (nameEl && div.textContent.includes('测试菜品')) {
        // Custom card
        const card = div.querySelector('.rounded-2xl');
        const img = div.querySelector('img');
        const tags = div.querySelectorAll('.rounded-full.font-bold');
        const cardRect = card ? card.getBoundingClientRect() : null;
        const imgRect = img ? img.getBoundingClientRect() : null;
        const tagTexts = Array.from(tags).map(t => ({
          text: t.textContent,
          fontSize: window.getComputedStyle(t).fontSize,
          color: window.getComputedStyle(t).color,
          bg: window.getComputedStyle(t).backgroundColor,
        }));
        results.custom = {
          cardW: cardRect?.width, cardH: cardRect?.height,
          imgW: imgRect?.width, imgH: imgRect?.height,
          imgLeft: imgRect?.left, imgRight: imgRect?.right,
          cardLeft: cardRect?.left, cardRight: cardRect?.right,
          leftGap: imgRect ? imgRect.left - cardRect.left : null,
          rightGap: cardRect ? cardRect.right - imgRect.right : null,
          borderRadius: card ? window.getComputedStyle(card).borderRadius : null,
          tags: tagTexts,
        };
      } else if (!div.querySelector('.font-black') && !div.querySelector('button') && div.querySelector('img')) {
        // Built-in card (no font-black, no buttons)
        const card = div.querySelector('.rounded-2xl');
        const img = div.querySelector('img');
        const cardRect = card ? card.getBoundingClientRect() : null;
        const imgRect = img ? img.getBoundingClientRect() : null;
        if (!results.builtin) {
          results.builtin = {
            cardW: cardRect?.width, cardH: cardRect?.height,
            imgW: imgRect?.width, imgH: imgRect?.height,
            imgLeft: imgRect?.left, imgRight: imgRect?.right,
            cardLeft: cardRect?.left, cardRight: cardRect?.right,
            leftGap: imgRect ? imgRect.left - cardRect.left : null,
            rightGap: cardRect ? cardRect.right - imgRect.right : null,
            borderRadius: card ? window.getComputedStyle(card).borderRadius : null,
          };
        }
      }
    }
    return results;
  });
  console.log('  Custom card:', JSON.stringify(warehouseData?.custom, null, 2));
  console.log('  Built-in card:', JSON.stringify(warehouseData?.builtin, null, 2));

  // 7. Go to homepage and check custom card
  console.log('\n--- 6. Homepage Custom Card ---');
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent.trim() === '首页') { btn.click(); break; }
    }
  });
  await new Promise(r => setTimeout(r, 1000));
  await ss('homepage-custom');

  const homepageData = await page.evaluate(() => {
    const frames = document.querySelectorAll('.food-card-frame');
    const results = { custom: null, builtin: null };
    for (const f of frames) {
      if (f.textContent.includes('测试菜品')) {
        const img = f.querySelector('img');
        const imgRect = img ? img.getBoundingClientRect() : null;
        const frameRect = f.getBoundingClientRect();
        const tags = f.querySelectorAll('.rounded-full.font-bold');
        const tagTexts = Array.from(tags).map(t => ({
          text: t.textContent,
          fontSize: window.getComputedStyle(t).fontSize,
          color: window.getComputedStyle(t).color,
          bg: window.getComputedStyle(t).backgroundColor,
        }));
        results.custom = {
          frameW: frameRect.width, frameH: frameRect.height,
          imgW: imgRect?.width, imgH: imgRect?.height,
          imgLeft: imgRect?.left, imgRight: imgRect?.right,
          frameLeft: frameRect.left, frameRight: frameRect.right,
          leftGap: imgRect ? imgRect.left - frameRect.left : null,
          rightGap: frameRect ? frameRect.right - imgRect.right : null,
          frameBorderRadius: window.getComputedStyle(f).borderRadius,
          imgBorderRadius: img ? window.getComputedStyle(img).borderRadius : null,
          tags: tagTexts,
        };
      } else if (!f.querySelector('.font-black') && !f.querySelector('img[alt=""]') === false) {
        // built-in
        const img = f.querySelector('img');
        if (!results.builtin && img) {
          const imgRect = img.getBoundingClientRect();
          const frameRect = f.getBoundingClientRect();
          results.builtin = {
            frameW: frameRect.width, frameH: frameRect.height,
            imgW: imgRect.width, imgH: imgRect.height,
            imgLeft: imgRect.left, imgRight: imgRect.right,
            frameLeft: frameRect.left, frameRight: frameRect.right,
            leftGap: imgRect.left - frameRect.left,
            rightGap: frameRect.right - imgRect.right,
            frameBorderRadius: window.getComputedStyle(f).borderRadius,
            imgBorderRadius: window.getComputedStyle(img).borderRadius,
          };
        }
      }
    }
    return results;
  });
  console.log('  Custom card:', JSON.stringify(homepageData?.custom, null, 2));
  console.log('  Built-in card:', JSON.stringify(homepageData?.builtin, null, 2));

  // 8. Navigate to show a built-in card in center for comparison
  console.log('\n--- 7. Homepage built-in center card ---');
  await page.evaluate(() => {
    // Click left arrow to move to a different card
    const arrows = document.querySelectorAll('button');
    for (const a of arrows) {
      if (a.querySelector('svg') && a.getBoundingClientRect().left < 80) {
        a.click(); break;
      }
    }
  });
  await new Promise(r => setTimeout(r, 600));
  await page.evaluate(() => {
    const arrows = document.querySelectorAll('button');
    for (const a of arrows) {
      if (a.querySelector('svg') && a.getBoundingClientRect().left < 80) {
        a.click(); break;
      }
    }
  });
  await new Promise(r => setTimeout(r, 600));
  await ss('homepage-builtin-center');

  // Cleanup - delete test card
  console.log('\n--- 8. Cleanup ---');
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent.trim() === '卡片仓库') { btn.click(); break; }
    }
  });
  await new Promise(r => setTimeout(r, 600));
  // Find and click the red delete button on the test card
  await page.evaluate(() => {
    const grid = document.querySelector('.grid');
    if (!grid) return;
    const divs = grid.querySelectorAll(':scope > div');
    for (const div of divs) {
      if (div.textContent.includes('测试菜品')) {
        const delBtn = div.querySelector('button');
        if (delBtn) delBtn.click();
      }
    }
  });
  await new Promise(r => setTimeout(r, 400));
  await ss('warehouse-after-cleanup');

  console.log('\n=== TEST COMPLETE ===');
  console.log('Browser staying open for inspection.');
})();
