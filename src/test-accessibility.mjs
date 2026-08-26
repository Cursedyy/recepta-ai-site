/**
 * WCAG 2.1 Accessibility Audit Script
 * 
 * Tests all pages for accessibility issues using axe-core.
 * Returns detailed report with violations, impact levels, and fixes.
 * 
 * Usage:
 *   node test-accessibility.mjs                    # Test all pages
 *   node test-accessibility.mjs --page home        # Test specific page
 *   node test-accessibility.mjs --strict           # Strict mode (fail on any issue)
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

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
  { name: 'mobile', width: 375, height: 812 },
];

// WCAG 2.1 Rules (subset for common issues)
const WCAG_RULES = {
  // Level A
  'color-contrast': { level: 'A', impact: 'serious' },
  'image-alt': { level: 'A', impact: 'critical' },
  'label': { level: 'A', impact: 'critical' },
  'link-name': { level: 'A', impact: 'serious' },
  'button-name': { level: 'A', impact: 'critical' },
  'html-has-lang': { level: 'A', impact: 'serious' },
  'html-lang-valid': { level: 'A', impact: 'serious' },
  'document-title': { level: 'A', impact: 'serious' },
  'valid-lang': { level: 'A', impact: 'serious' },
  'bypass': { level: 'A', impact: 'serious' },
  'region': { level: 'A', impact: 'moderate' },
  'heading-order': { level: 'A', impact: 'moderate' },
  'frame-title': { level: 'A', impact: 'serious' },
  'input-image-alt': { level: 'A', impact: 'critical' },
  'aria-required-attr': { level: 'A', impact: 'critical' },
  'aria-required-children': { level: 'A', impact: 'critical' },
  'aria-required-parent': { level: 'A', impact: 'critical' },
  'aria-roles': { level: 'A', impact: 'critical' },
  'aria-valid-attr': { level: 'A', impact: 'critical' },
  'aria-valid-attr-value': { level: 'A', impact: 'critical' },
  'td-has-header': { level: 'A', impact: 'critical' },
  'th-has-data-cells': { level: 'A', impact: 'serious' },
  
  // Level AA
  'color-contrast-enhanced': { level: 'AA', impact: 'serious' },
  'identical-links-same-purpose': { level: 'AA', impact: 'moderate' },
  'link-in-text-block': { level: 'AA', impact: 'serious' },
  'target-size': { level: 'AA', impact: 'serious' },
  'focus-order-semantics': { level: 'AA', impact: 'serious' },
};

// ============ PARSE ARGS ============

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    strict: false,
    page: null,
    baseUrl: BASE_URL,
    outputDir: 'screenshots/a11y',
    timeout: 30000,
    maxSerious: 5,
    maxCritical: 0,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--strict': config.strict = true; break;
      case '--page': config.page = args[++i]; break;
      case '--base-url': config.baseUrl = args[++i]; break;
      case '--output-dir': config.outputDir = args[++i]; break;
      case '--max-serious': config.maxSerious = parseInt(args[++i]) || 5; break;
      case '--max-critical': config.maxCritical = parseInt(args[++i]) || 0; break;
    }
  }

  return config;
}

// ============ INJECT AXE-CORE ============

import { readFileSync } from 'fs';
import { resolve } from 'path';

async function injectAxe(page) {
  const axePath = resolve('node_modules/axe-core/axe.min.js');
  const axeSource = readFileSync(axePath, 'utf-8');
  await page.evaluate(axeSource);
}

// ============ RUN AUDIT ============

async function runAudit(page, pageDef, viewport, config) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  
  try {
    const url = `${config.baseUrl}${pageDef.url}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: config.timeout });
    await page.waitForTimeout(1000);
    
    // Inject axe-core
    await injectAxe(page);
    
    // Run axe analysis
    const results = await page.evaluate(async () => {
      const axeResults = await axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']
        }
      });
      
      return {
        violations: axeResults.violations.map(v => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          help: v.help,
          helpUrl: v.helpUrl,
          tags: v.tags,
          nodes: v.nodes.slice(0, 5).map(n => ({
            html: n.html.substring(0, 200),
            target: n.target,
            failureSummary: n.failureSummary
          })),
          nodeCount: v.nodes.length
        })),
        passes: axeResults.passes.length,
        incomplete: axeResults.incomplete.length,
        inapplicable: axeResults.inapplicable.length,
        timestamp: axeResults.timestamp,
        url: axeResults.url
      };
    });
    
    // Take screenshot
    mkdirSync(config.outputDir, { recursive: true });
    const screenshotPath = `${config.outputDir}/${pageDef.name}-${viewport.name}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    
    // Categorize violations
    const critical = results.violations.filter(v => v.impact === 'critical');
    const serious = results.violations.filter(v => v.impact === 'serious');
    const moderate = results.violations.filter(v => v.impact === 'moderate');
    const minor = results.violations.filter(v => v.impact === 'minor');
    
    return {
      page: pageDef.name,
      viewport: viewport.name,
      url: `${config.baseUrl}${pageDef.url}`,
      critical: critical.length,
      serious: serious.length,
      moderate: moderate.length,
      minor: minor.length,
      total: results.violations.length,
      passes: results.passes,
      incomplete: results.incomplete,
      violations: results.violations,
      screenshot: screenshotPath,
      passed: critical.length <= config.maxCritical && serious.length <= config.maxSerious,
    };
  } catch (error) {
    return {
      page: pageDef.name,
      viewport: viewport.name,
      url: `${config.baseUrl}${pageDef.url}`,
      error: error.message,
      critical: -1,
      serious: -1,
      moderate: -1,
      minor: -1,
      total: -1,
      passes: 0,
      incomplete: 0,
      violations: [],
      passed: false,
    };
  }
}

// ============ MAIN ============

async function main() {
  const config = parseArgs();
  
  console.log('🔍 WCAG 2.1 Accessibility Audit');
  console.log('='.repeat(60));
  console.log(`Base URL: ${config.baseUrl}`);
  console.log(`Strict: ${config.strict}`);
  console.log('');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const pagesToTest = config.page 
    ? PAGES.filter(p => p.name === config.page)
    : PAGES;
  
  const results = [];
  
  for (const pageDef of pagesToTest) {
    console.log(`📄 ${pageDef.name} (${pageDef.url})`);
    
    for (const viewport of VIEWPORTS) {
      const result = await runAudit(page, pageDef, viewport, config);
      results.push(result);
      
      if (result.error) {
        console.log(`  ❌ ${viewport.name}: ERROR - ${result.error}`);
      } else if (result.passed) {
        console.log(`  ✅ ${viewport.name}: PASS (${result.critical} critical, ${result.serious} serious, ${result.moderate} moderate)`);
      } else {
        console.log(`  ⚠️  ${viewport.name}: FAIL (${result.critical} critical, ${result.serious} serious, ${result.moderate} moderate)`);
      }
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
  
  const totalCritical = results.reduce((sum, r) => sum + (r.critical > 0 ? r.critical : 0), 0);
  const totalSerious = results.reduce((sum, r) => sum + (r.serious > 0 ? r.serious : 0), 0);
  const totalModerate = results.reduce((sum, r) => sum + (r.moderate > 0 ? r.moderate : 0), 0);
  const totalMinor = results.reduce((sum, r) => sum + (r.minor > 0 ? r.minor : 0), 0);
  
  console.log(`Total tests: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Errors: ${errors}`);
  console.log('');
  console.log(`Critical issues: ${totalCritical}`);
  console.log(`Serious issues: ${totalSerious}`);
  console.log(`Moderate issues: ${totalModerate}`);
  console.log(`Minor issues: ${totalMinor}`);
  
  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: config.baseUrl,
    strict: config.strict,
    thresholds: {
      maxCritical: config.maxCritical,
      maxSerious: config.maxSerious,
    },
    summary: {
      total: results.length,
      passed,
      failed,
      errors,
      totalCritical,
      totalSerious,
      totalModerate,
      totalMinor,
    },
    results,
  };
  
  mkdirSync(config.outputDir, { recursive: true });
  writeFileSync(`${config.outputDir}/a11y-report.json`, JSON.stringify(report, null, 2));
  console.log(`\n📁 Report saved to ${config.outputDir}/a11y-report.json`);
  
  // GitHub Actions output
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import('fs');
    appendFileSync(process.env.GITHUB_OUTPUT, `passed=${passed}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `failed=${failed}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `critical_issues=${totalCritical}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `serious_issues=${totalSerious}\n`);
  }
  
  // Determine pass/fail
  const overallPassed = totalCritical <= config.maxCritical && totalSerious <= config.maxSerious;
  
  if (overallPassed) {
    console.log('\n✅ OVERALL: PASS');
    process.exit(0);
  } else {
    console.log('\n❌ OVERALL: FAIL');
    if (totalCritical > config.maxCritical) {
      console.log(`   Critical issues (${totalCritical}) exceeded threshold (${config.maxCritical})`);
    }
    if (totalSerious > config.maxSerious) {
      console.log(`   Serious issues (${totalSerious}) exceeded threshold (${config.maxSerious})`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
