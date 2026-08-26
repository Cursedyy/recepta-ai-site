const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if(msg.type() === 'error') errors.push(msg.text()); });

  await page.goto('https://www.receptaai.com.br/briefing/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const sections = await page.locator('section').count();
  const inputs = await page.locator('section.active input, section.active textarea, section.active select').count();
  const allInputs = await page.locator('input, textarea, select').count();
  const checkboxes = await page.locator('input[type=checkbox]').count();
  const stepper = await page.locator('.steps-rail').count();
  const activeSection = await page.locator('section.active').count();
  const stepDots = await page.locator('.step-dot').count();
  const fieldLabels = await page.locator('section.active label.l, section.active legend.l').count();
  const continueBtn = await page.locator('#btn').textContent();

  console.log('=== Briefing Page Check ===');
  console.log('Sections (total):', sections);
  console.log('Active section:', activeSection);
  console.log('Step dots in stepper:', stepDots);
  console.log('Stepper present:', stepper > 0);
  console.log('Inputs in active section:', inputs);
  console.log('All inputs on page:', allInputs);
  console.log('Checkboxes:', checkboxes);
  console.log('Field labels in active section:', fieldLabels);
  console.log('Continue button text:', continueBtn);
  console.log('JS errors:', errors.length ? errors.join('\n  ') : 'none');

  await page.screenshot({ path: 'src/briefing-screenshot.png', fullPage: true });
  console.log('Screenshot saved to src/briefing-screenshot.png');

  // Click continue to go to step 2
  await page.click('#btn');
  await page.waitForTimeout(500);
  const step2Active = await page.locator('section.active').count();
  const step2Checkboxes = await page.locator('section.active input[type=checkbox]').count();
  console.log('\n=== After clicking Continue ===');
  console.log('Active section:', step2Active);
  console.log('Checkboxes in step 2:', step2Checkboxes);
  await page.screenshot({ path: 'src/briefing-screenshot-step2.png', fullPage: true });
  console.log('Step 2 screenshot saved');

  await browser.close();
})();
