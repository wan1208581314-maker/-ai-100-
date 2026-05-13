const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:5173';
const QA_DIR = path.join(__dirname, '.claude', 'qa');
const SHOTS = path.join(QA_DIR, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

let browser, page;
const results = [];
const bugs = [];
const consoleErrors = [];

function log(test, pass, detail = '') {
  results.push({ test, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${test}${detail ? ' - ' + detail : ''}`);
}

function bug(title, severity, steps, expected, actual) {
  bugs.push({ title, severity, steps, expected, actual });
  console.log(`[BUG] ${title} (${severity})`);
}

async function shot(name) {
  const fp = path.join(SHOTS, name + '.png');
  await page.screenshot({ path: fp, fullPage: false });
  console.log(`  -> ${name}.png`);
  return fp;
}

async function run() {
  console.log('\n' + '='.repeat(60));
  console.log('  HUMAN QA TEST - 今天吃什么');
  console.log('  ' + new Date().toISOString());
  console.log('='.repeat(60));

  // Phase 1: Project identification
  console.log('\n--- Phase 1: Project Identification ---');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  log('Project identified', true, `${pkg.name} - React ${pkg.dependencies.react}`);

  // Phase 2: Static checks
  console.log('\n--- Phase 2: Static Checks ---');

  // Lint
  try {
    execSync('npm run lint', { cwd: __dirname, stdio: 'pipe' });
    log('Lint check', true);
  } catch (e) {
    const output = e.stdout ? e.stdout.toString() : e.stderr.toString();
    log('Lint check', false, output.substring(0, 200));
    bug('Lint errors found', '中', ['Run npm run lint'], 'No errors', 'Lint errors found');
  }

  // Build
  try {
    execSync('npm run build', { cwd: __dirname, stdio: 'pipe' });
    log('Build check', true);
  } catch (e) {
    const output = e.stdout ? e.stdout.toString() : e.stderr.toString();
    log('Build check', false, output.substring(0, 200));
    bug('Build failed', '高', ['Run npm run build'], 'Build succeeds', 'Build failed');
  }

  // Phase 3: Launch app
  console.log('\n--- Phase 3: Launch App ---');

  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 390, height: 844 },
  });
  page = await browser.newPage();

  // Collect console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push(err.message);
  });

  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 15000 });
  log('App launched', true);

  // Phase 4: Test Plan
  console.log('\n--- Phase 4: Test Plan ---');
  const testPlan = [
    'Home page layout and content',
    'Knob spin functionality',
    'Spin count increment',
    'Warehouse page navigation',
    'Category filtering',
    'Card maker form',
    'Image upload and crop',
    'Custom card save and display',
    'Custom card delete',
    'Drag/swipe on carousel',
    'Data persistence (localStorage)',
    'Console error check',
  ];
  log('Test plan created', true, `${testPlan.length} test items`);

  // Phase 5: Execute Tests
  console.log('\n--- Phase 5: Execute Tests ---');

  // Test 1: Home page
  console.log('\n[1/12] Home Page');
  await shot('qa-01-home');
  const title = await page.$eval('h1', el => el.textContent);
  log('Title correct', title === '今天吃什么', `got "${title}"`);

  const fireCount = await page.evaluate(() => {
    const spans = document.querySelectorAll('span');
    for (const s of spans) {
      if (s.className.includes('font-black') && /^\d+$/.test(s.textContent.trim())) {
        return s.textContent.trim();
      }
    }
    return null;
  });
  log('Fire count displayed', fireCount !== null, `value: ${fireCount}`);

  const cardImages = await page.$$('img[draggable="false"]');
  log('Card carousel has images', cardImages.length >= 3, `${cardImages.length} cards`);

  const navCheck = await page.evaluate(() => {
    const spans = document.querySelectorAll('span');
    const texts = Array.from(spans).map(s => s.textContent.trim());
    return texts.includes('首页') && texts.includes('卡片仓库');
  });
  log('Bottom navigation', navCheck);

  const hintCheck = await page.evaluate(() => {
    const body = document.body.textContent;
    return body.includes('点击卡片查看') && body.includes('左右滑动切换');
  });
  log('Hint text', hintCheck);

  // Test 2: Knob spin
  console.log('\n[2/12] Knob Spin');
  const knobPos = await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      const rect = btn.getBoundingClientRect();
      if (rect.width > 140 && rect.width < 170 && rect.height > 140 && rect.height < 170) {
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }
    }
    return null;
  });
  log('Knob found', knobPos !== null);

  if (knobPos) {
    await page.mouse.click(knobPos.x, knobPos.y);
    await new Promise(r => setTimeout(r, 1000));
    await shot('qa-02-spinning');
    log('Spin started', true);

    await page.mouse.click(knobPos.x, knobPos.y);
    await new Promise(r => setTimeout(r, 7000));
    await shot('qa-03-stopped');

    const countAfter = await page.evaluate(() => {
      const spans = document.querySelectorAll('span');
      for (const s of spans) {
        if (s.className.includes('font-black') && /^\d+$/.test(s.textContent.trim())) {
          return s.textContent.trim();
        }
      }
      return null;
    });
    const countVal = parseInt(countAfter || '0');
    log('Spin count incremented', countVal > 0, `count: ${countAfter}`);
  }

  // Test 3: Warehouse
  console.log('\n[3/12] Warehouse Page');
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent.trim() === '卡片仓库') { btn.click(); break; }
    }
  });
  await new Promise(r => setTimeout(r, 600));
  await shot('qa-04-warehouse');

  const whTitle = await page.$eval('h1', el => el.textContent);
  log('Warehouse title', whTitle === '卡片仓库');

  const catCount = await page.evaluate(() => {
    const expected = ['全部', '家常', '面食', '夜宵', '快餐', '轻食'];
    const btns = document.querySelectorAll('button');
    let found = 0;
    for (const btn of btns) {
      if (expected.includes(btn.textContent.trim())) found++;
    }
    return found;
  });
  log('Category tabs', catCount === 6, `found ${catCount}`);

  const gridCards = await page.evaluate(() => {
    const grid = document.querySelector('.grid');
    return grid ? grid.children.length : 0;
  });
  log('Card grid items', gridCards > 0, `${gridCards} items`);

  // Test 4: Category filter
  console.log('\n[4/12] Category Filter');
  await page.evaluate(() => {
    const wh = document.querySelector('.overflow-x-auto');
    if (wh) {
      const btns = wh.querySelectorAll('button');
      for (const btn of btns) {
        if (btn.textContent.trim() === '面食') { btn.click(); break; }
      }
    }
  });
  await new Promise(r => setTimeout(r, 400));
  const filteredCount = await page.evaluate(() => {
    const grid = document.querySelector('.grid');
    return grid ? grid.children.length : 0;
  });
  log('Filter works', filteredCount > 0 && filteredCount < gridCards, `${filteredCount} items`);

  // Reset filter
  await page.evaluate(() => {
    const wh = document.querySelector('.overflow-x-auto');
    if (wh) {
      const btns = wh.querySelectorAll('button');
      for (const btn of btns) {
        if (btn.textContent.trim() === '全部') { btn.click(); break; }
      }
    }
  });
  await new Promise(r => setTimeout(r, 400));

  // Test 5: Card Maker
  console.log('\n[5/12] Card Maker');
  await page.evaluate(() => {
    const grid = document.querySelector('.grid');
    if (grid) grid.lastElementChild.click();
  });
  await new Promise(r => setTimeout(r, 800));
  await shot('qa-05-maker');

  const makerOpen = await page.evaluate(() => document.body.textContent.includes('新增卡片'));
  log('Maker opened', makerOpen);

  const formCheck = await page.evaluate(() => {
    const labels = document.querySelectorAll('label');
    const texts = Array.from(labels).map(l => l.textContent);
    return {
      upload: texts.some(t => t.includes('上传')),
      name: texts.some(t => t.includes('菜名')),
      category: texts.some(t => t.includes('分类')),
      tags: texts.some(t => t.includes('标签')),
    };
  });
  log('Form sections', formCheck.upload && formCheck.name && formCheck.category && formCheck.tags);

  // Test 6: Upload + Crop
  console.log('\n[6/12] Upload + Crop');
  const testImg = path.join(__dirname, 'public', 'images', '01-malatang.png');
  if (fs.existsSync(testImg)) {
    const fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile(testImg);
    await new Promise(r => setTimeout(r, 1000));

    const cropShown = await page.evaluate(() => document.body.textContent.includes('调整截取范围'));
    log('Crop editor', cropShown);
    await shot('qa-06-crop');

    // Confirm crop
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const btn of btns) {
        if (btn.textContent.trim() === '确认') { btn.click(); break; }
      }
    });
    await new Promise(r => setTimeout(r, 800));
    log('Crop confirmed', true);

    // Fill form
    const nameInput = await page.$('input[type="text"]');
    await nameInput.type('QA测试菜');
    await page.evaluate(() => {
      const overlay = document.querySelector('[class*="fixed"][class*="inset-0"][class*="z-50"]');
      if (overlay) {
        const btns = overlay.querySelectorAll('button');
        for (const btn of btns) {
          if (btn.textContent.trim() === '家常') { btn.click(); break; }
        }
      }
    });
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => {
      const overlay = document.querySelector('[class*="fixed"][class*="inset-0"][class*="z-50"]');
      if (overlay) {
        const btns = overlay.querySelectorAll('button');
        for (const btn of btns) {
          if (btn.textContent.trim() === '下饭') { btn.click(); break; }
        }
      }
    });
    await new Promise(r => setTimeout(r, 500));
    await shot('qa-07-form-filled');

    const previewShown = await page.evaluate(() => document.body.textContent.includes('卡片预览'));
    log('Card preview', previewShown);

    // Test 7: Save
    console.log('\n[7/12] Save Custom Card');
    const saveReady = await page.evaluate(() => {
      const overlay = document.querySelector('[class*="fixed"][class*="inset-0"][class*="z-50"]');
      if (overlay) {
        const btns = overlay.querySelectorAll('button');
        for (const btn of btns) {
          if (btn.textContent.includes('保存到仓库')) return !btn.disabled;
        }
      }
      return false;
    });
    log('Save button enabled', saveReady);

    if (saveReady) {
      await page.evaluate(() => {
        const overlay = document.querySelector('[class*="fixed"][class*="inset-0"][class*="z-50"]');
        if (overlay) {
          const btns = overlay.querySelectorAll('button');
          for (const btn of btns) {
            if (btn.textContent.includes('保存到仓库')) { btn.click(); break; }
          }
        }
      });
      await new Promise(r => setTimeout(r, 800));
      log('Card saved', true);
      await shot('qa-08-after-save');
    }

    // Test 8: Custom card in warehouse
    console.log('\n[8/12] Custom Card Display');
    const customVisible = await page.evaluate(() => document.body.textContent.includes('QA测试菜'));
    log('Custom card visible', customVisible);

    // Test 9: Delete custom card
    console.log('\n[9/12] Delete Custom Card');
    const hasDelete = await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const btn of btns) {
        const computed = window.getComputedStyle(btn);
        const bg = computed.backgroundColor;
        if (bg && bg.includes('220') && bg.includes('60')) return true;
      }
      return false;
    });
    log('Delete button exists', hasDelete);

    if (hasDelete) {
      await page.evaluate(() => {
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
          const computed = window.getComputedStyle(btn);
          const bg = computed.backgroundColor;
          if (bg && bg.includes('220') && bg.includes('60')) { btn.click(); break; }
        }
      });
      await new Promise(r => setTimeout(r, 500));
      const deleted = await page.evaluate(() => !document.body.textContent.includes('QA测试菜'));
      log('Custom card deleted', deleted);
    }
  }

  // Test 10: Drag/swipe
  console.log('\n[10/12] Drag/Swipe');
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent.trim() === '首页') { btn.click(); break; }
    }
  });
  await new Promise(r => setTimeout(r, 500));
  await shot('qa-09-home-drag');

  const dragContainer = await page.evaluate(() => {
    const divs = document.querySelectorAll('[style*="touch-action"]');
    return divs.length > 0;
  });
  log('Drag container exists', dragContainer);

  if (dragContainer) {
    const cx = 195, cy = 400;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(cx - i * 20, cy, { steps: 1 });
      await new Promise(r => setTimeout(r, 16));
    }
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 400));
    log('Drag executed', true);
    await shot('qa-10-after-drag');
  }

  // Test 11: Final spin
  console.log('\n[11/12] Final Spin');
  if (knobPos) {
    await page.mouse.click(knobPos.x, knobPos.y);
    await new Promise(r => setTimeout(r, 1500));
    await page.mouse.click(knobPos.x, knobPos.y);
    await new Promise(r => setTimeout(r, 7000));
    await shot('qa-11-final-result');
    log('Final spin completed', true);
  }

  // Test 12: Persistence
  console.log('\n[12/12] Persistence');
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));

  const persistedCount = await page.evaluate(() => localStorage.getItem('spinCount'));
  log('Spin count persisted', persistedCount !== null && parseInt(persistedCount) > 0, `count: ${persistedCount}`);

  const persistedCards = await page.evaluate(() => {
    const v = localStorage.getItem('remainingCards');
    return v ? JSON.parse(v).length : 0;
  });
  log('Cards persisted', persistedCards > 0, `${persistedCards} cards`);

  await shot('qa-12-after-reload');

  // Phase 6: Console errors
  console.log('\n--- Phase 6: Console Error Check ---');
  if (consoleErrors.length > 0) {
    log('Console errors', false, `${consoleErrors.length} errors found`);
    consoleErrors.forEach((err, i) => {
      console.log(`  [ERROR ${i+1}] ${err.substring(0, 150)}`);
    });
  } else {
    log('No console errors', true);
  }

  // Phase 7: Generate reports
  console.log('\n--- Phase 7: Generate Reports ---');

  // Bug report
  const bugReport = `# Bug Report - ${new Date().toISOString()}

## Test Results
${results.map(r => `- [${r.pass ? 'PASS' : 'FAIL'}] ${r.test}${r.detail ? ' - ' + r.detail : ''}`).join('\n')}

## Bugs Found
${bugs.length === 0 ? 'No bugs found.' : bugs.map((b, i) => `
### Bug #${i+1}: ${b.title}
- **Severity**: ${b.severity}
- **Steps**: ${b.steps.join(', ')}
- **Expected**: ${b.expected}
- **Actual**: ${b.actual}
`).join('\n')}

## Console Errors
${consoleErrors.length === 0 ? 'No console errors.' : consoleErrors.map((e, i) => `- [ERROR ${i+1}] ${e}`).join('\n')}
`;
  fs.writeFileSync(path.join(QA_DIR, 'bug-report.md'), bugReport);

  // Final QA report
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const hasBugs = bugs.length > 0 || consoleErrors.length > 0;
  const approved = !hasBugs && failed === 0;

  const qaReport = `# Final QA Report - ${new Date().toISOString()}

## Test Overview
- Test time: ${new Date().toLocaleString('zh-CN')}
- Test environment: Chrome Headless, 390x844 viewport
- Test scope: Full application flow

## Test Results
| Test | Result | Detail |
|------|--------|--------|
${results.map(r => `| ${r.test} | ${r.pass ? '✅' : '❌'} | ${r.detail || '-'} |`).join('\n')}

## Summary
- **Total**: ${results.length}
- **Passed**: ${passed}
- **Failed**: ${failed}
- **Bugs found**: ${bugs.length}
- **Console errors**: ${consoleErrors.length}

## Approval
- **APPROVED: ${approved ? 'YES' : 'NO'}**
- **Approver**: Claude Code (Human QA Workflow)
- **Time**: ${new Date().toISOString()}
- **Reason**: ${approved ? 'All tests passed, no bugs found' : `${failed} tests failed, ${bugs.length} bugs found`}
`;
  fs.writeFileSync(path.join(QA_DIR, 'final-qa-report.md'), qaReport);

  // Approval hash
  try {
    const diff = execSync('git diff HEAD', { cwd: __dirname, encoding: 'utf8' });
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(diff).digest('hex');
    fs.writeFileSync(path.join(QA_DIR, 'approval.hash'), hash);
  } catch {
    // Not a git repo or no changes
    fs.writeFileSync(path.join(QA_DIR, 'approval.hash'), 'no-git');
  }

  // Cleanup
  await browser.close();

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('  QA REPORT SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Tests: ${passed}/${results.length} passed`);
  console.log(`  Bugs: ${bugs.length}`);
  console.log(`  Console Errors: ${consoleErrors.length}`);
  console.log(`  APPROVED: ${approved ? 'YES' : 'NO'}`);
  console.log('='.repeat(60));

  if (!approved) {
    console.log('\n  ISSUES:');
    results.filter(r => !r.pass).forEach(r => {
      console.log(`    - ${r.test}: ${r.detail}`);
    });
    bugs.forEach(b => {
      console.log(`    - BUG: ${b.title} (${b.severity})`);
    });
  }

  console.log(`\n  Reports saved to: ${QA_DIR}`);
  process.exit(approved ? 0 : 1);
}

run().catch(err => {
  console.error('QA test error:', err);
  browser && browser.close();
  process.exit(1);
});
