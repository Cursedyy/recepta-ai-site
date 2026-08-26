/**
 * CI/CD Responsive Test Script
 * 
 * Tests all pages for responsiveness across desktop, tablet, and mobile viewports.
 * Returns exit code 0 on success, 1 on failure (threshold exceeded).
 * 
 * Usage:
 *   node test-responsive-ci.mjs                    # Default thresholds
 *   node test-responsive-ci.mjs --max-overflow 0   # No overflow allowed
 *   node test-responsive-ci.mjs --max-total 50     # Max 50 total issues
 *   node test-responsive-ci.mjs --base-url http://localhost:3000  # Custom URL
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, appendFileSync } from 'fs';

// ============ CONFIGURATION ============

const BASE_URL = process.env.BASE_URL || 'https://www.receptaai.com.br';

const PAGES = [
  { name: 'home', url: '/', critical: true },
  { name: 'briefing', url: '/briefing', critical: false },
  { name: 'login', url: '/clinica/login/', critical: true },
  { name: 'definir-senha', url: '/clinica/definir-senha/', critical: false },
  { name: 'esqueci-senha', url: '/clinica/esqueci-senha/', critical: false },
  { name: 'painel', url: '/painel/', critical: true },
  { name: 'termos', url: '/termos/', critical: false },
  { name: 'privacidade', url: '/privacidade/', critical: false },
  { name: 'trial', url: '/t/', critical: false },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
];

// ============ THRESHOLDS ============

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    maxOverflow: 0,        // Max horizontal overflow issues per page
    maxTouchSmall: 20,     // Max touch-target-small issues per page
    maxTotal: 150,         // Max total issues across all pages
    maxCritical: 0,        // Max issues on critical pages
    baseUrl: BASE_URL,
    outputDir: 'screenshots/ci',
    timeout: 30000,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--max-overflow': config.maxOverflow = parseInt(args[++i]) || 0; break;
      case '--max-touch-small': config.maxTouchSmall = parseInt(args[++i]) || 10; break;
      case '--max-total': config.maxTotal = parseInt(args[++i]) || 50; break;
      case '--max-critical': config.maxCritical = parseInt(args[++i]) || 0; break;
      case '--base-url': config.baseUrl = args[++i]; break;
      case '--output-dir': config.outputDir = args[++i]; break;
      case '--timeout': config.timeout = parseInt(args[++i]) || 30000; break;
    }
  }

  return config;
}

// ============ TEST FUNCTIONS ============

async function testPage(page, pageDef, viewport, config) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  
  try {
    const url = `${config.baseUrl}${pageDef.url}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: config.timeout });
    await page.waitForTimeout(1000);
    
    // Check for horizontal overflow
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    
    // Check for elements extending beyond viewport
    const overflowElements = await page.evaluate((vpWidth) => {
      const issues = [];
      const allElements = document.querySelectorAll('*');
      
      for (const el of allElements) {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0) continue;
        
        if (rect.right > vpWidth + 5) {
          const tag = el.tagName.toLowerCase();
          const id = el.id ? `#${el.id}` : '';
          const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : '';
          issues.push({
            element: `${tag}${id}${cls}`,
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          });
        }
      }
      return issues;
    }, viewport.width);
    
    // Check for touch targets
    const touchIssues = await page.evaluate((vpWidth) => {
      const issues = [];
      const interactives = document.querySelectorAll('button, a[href], input, select, textarea');
      
      for (const el of interactives) {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        
        if (rect.width > 0 && rect.height > 0 && (rect.width < 32 || rect.height < 32)) {
          const tag = el.tagName.toLowerCase();
          const text = el.textContent?.substring(0, 20) || el.placeholder || '';
          issues.push({
            element: `${tag} "${text}"`,
            type: 'touch-target-small',
            size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
          });
        }
      }
      return issues;
    }, viewport.width);
    
    // Take screenshot
    mkdirSync(config.outputDir, { recursive: true });
    const screenshotPath = `${config.outputDir}/${pageDef.name}-${viewport.name}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    
    const overflowCount = overflowElements.length + (hasOverflow ? 1 : 0);
    const touchCount = touchIssues.length;
    
    return {
      page: pageDef.name,
      viewport: viewport.name,
      url: `${config.baseUrl}${pageDef.url}`,
      overflow: overflowCount,
      touchTargets: touchCount,
      total: overflowCount + touchCount,
      screenshot: screenshotPath,
      passed: overflowCount <= config.maxOverflow && touchCount <= config.maxTouchSmall,
    };
  } catch (error) {
    return {
      page: pageDef.name,
      viewport: viewport.name,
      url: `${config.baseUrl}${pageDef.url}`,
      error: error.message,
      overflow: -1,
      touchTargets: -1,
      total: -1,
      passed: false,
    };
  }
}

// ============ GITHUB ACTIONS OUTPUT ============



// ============ MAIN ============

async function main() {
  const config = parseArgs();
  
  console.log('🔍 CI/CD Responsive Test');
  console.log('='.repeat(60));
  console.log(`Base URL: ${config.baseUrl}`);
  console.log(`Thresholds: overflow=${config.maxOverflow}, touch=${config.maxTouchSmall}, total=${config.maxTotal}`);
  console.log('');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const results = [];
  let totalIssues = 0;
  let criticalIssues = 0;
  
  for (const pageDef of PAGES) {
    console.log(`📄 ${pageDef.name} (${pageDef.url})`);
    
    for (const viewport of VIEWPORTS) {
      const result = await testPage(page, pageDef, viewport, config);
      results.push(result);
      
      if (result.error) {
        console.log(`  ❌ ${viewport.name}: ERROR - ${result.error}`);
        criticalIssues++;
      } else if (result.passed) {
        console.log(`  ✅ ${viewport.name}: PASS (${result.total} issues)`);
      } else {
        console.log(`  ⚠️  ${viewport.name}: FAIL (${result.overflow} overflow, ${result.touchTargets} touch)`);
        if (pageDef.critical) {
          criticalIssues += result.total;
        }
      }
      
      totalIssues += result.total;
    }
  }
  
  await browser.close();
  
  // Summary
  console.log('');
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed && !r.error).length;
  const errors = results.filter(r => r.error).length;
  
  console.log(`Total tests: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total issues: ${totalIssues}`);
  console.log(`Critical issues: ${criticalIssues}`);
  
  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: config.baseUrl,
    thresholds: {
      maxOverflow: config.maxOverflow,
      maxTouchSmall: config.maxTouchSmall,
      maxTotal: config.maxTotal,
      maxCritical: config.maxCritical,
    },
    summary: {
      total: results.length,
      passed,
      failed,
      errors,
      totalIssues,
      criticalIssues,
    },
    results,
  };
  
  mkdirSync(config.outputDir, { recursive: true });
  writeFileSync(`${config.outputDir}/report.json`, JSON.stringify(report, null, 2));
  console.log(`\n📁 Report saved to ${config.outputDir}/report.json`);
  
  // GitHub Actions output
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `passed=${passed}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `failed=${failed}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `total_issues=${totalIssues}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `critical_issues=${criticalIssues}\n`);
  }
  
  // Determine pass/fail
  const overallPassed = criticalIssues <= config.maxCritical && totalIssues <= config.maxTotal;
  
  if (overallPassed) {
    console.log('\n✅ OVERALL: PASS');
    process.exit(0);
  } else {
    console.log('\n❌ OVERALL: FAIL');
    console.log(`   Critical issues (${criticalIssues}) exceeded threshold (${config.maxCritical})`);
    console.log(`   Total issues (${totalIssues}) exceeded threshold (${config.maxTotal})`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
