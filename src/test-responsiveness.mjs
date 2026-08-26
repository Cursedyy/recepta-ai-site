import { chromium } from 'playwright';

const PAGES = [
  { name: 'home', url: 'https://www.receptaai.com.br/' },
  { name: 'briefing', url: 'https://www.receptaai.com.br/briefing' },
  { name: 'login', url: 'https://www.receptaai.com.br/clinica/login/' },
  { name: 'definir-senha', url: 'https://www.receptaai.com.br/clinica/definir-senha/' },
  { name: 'esqueci-senha', url: 'https://www.receptaai.com.br/clinica/esqueci-senha/' },
  { name: 'painel', url: 'https://www.receptaai.com.br/painel/' },
  { name: 'termos', url: 'https://www.receptaai.com.br/termos/' },
  { name: 'privacidade', url: 'https://www.receptaai.com.br/privacidade/' },
  { name: 'trial', url: 'https://www.receptaai.com.br/t/' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
];

async function testPage(page, pageDef, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  
  try {
    await page.goto(pageDef.url, { waitUntil: 'networkidle', timeout: 15000 });
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
        
        // Skip hidden elements
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0) continue;
        
        // Check if element extends beyond right edge
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
    
    // Check for text overflow / truncation
    const textIssues = await page.evaluate(() => {
      const issues = [];
      const textElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, a, button, label, li');
      
      for (const el of textElements) {
        const style = window.getComputedStyle(el);
        if (style.overflow === 'hidden' && style.textOverflow === 'ellipsis') {
          // Check if text is actually truncated
          if (el.scrollWidth > el.clientWidth + 2) {
            issues.push({
              element: `${el.tagName.toLowerCase()} "${el.textContent.substring(0, 30)}..."`,
              type: 'text-truncated',
            });
          }
        }
      }
      return issues;
    });
    
    // Check for images
    const imageIssues = await page.evaluate(() => {
      const issues = [];
      const images = document.querySelectorAll('img');
      
      for (const img of images) {
        if (!img.complete || img.naturalWidth === 0) {
          issues.push({
            element: `img[src="${img.src.substring(0, 50)}..."]`,
            type: 'image-broken',
          });
        }
      }
      return issues;
    });
    
    // Check for buttons/links accessibility
    const buttonIssues = await page.evaluate((vpWidth) => {
      const issues = [];
      const interactives = document.querySelectorAll('button, a[href], input, select, textarea');
      
      for (const el of interactives) {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        
        // Check if button is too small (touch target)
        if (rect.width > 0 && rect.height > 0 && (rect.width < 32 || rect.height < 32)) {
          const tag = el.tagName.toLowerCase();
          const text = el.textContent?.substring(0, 20) || el.placeholder || '';
          issues.push({
            element: `${tag} "${text}"`,
            type: 'touch-target-small',
            size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
          });
        }
        
        // Check if element extends beyond viewport
        if (rect.right > vpWidth + 5 || rect.left < -5) {
          issues.push({
            element: `${el.tagName.toLowerCase()} "${el.textContent?.substring(0, 20) || ''}"`,
            type: 'out-of-viewport',
          });
        }
      }
      return issues;
    }, viewport.width);
    
    // Take screenshot
    const screenshotPath = `screenshots/${pageDef.name}-${viewport.name}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    
    const allIssues = [
      ...overflowElements.map(e => ({ ...e, category: 'overflow' })),
      ...textIssues,
      ...imageIssues,
      ...buttonIssues,
    ];
    
    return {
      page: pageDef.name,
      viewport: viewport.name,
      url: pageDef.url,
      hasHorizontalOverflow: hasOverflow,
      issues: allIssues,
      screenshot: screenshotPath,
    };
  } catch (error) {
    return {
      page: pageDef.name,
      viewport: viewport.name,
      url: pageDef.url,
      error: error.message,
    };
  }
}

async function main() {
  console.log('🔍 Iniciando teste de responsividade...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const results = [];
  
  for (const pageDef of PAGES) {
    console.log(`📄 Testando: ${pageDef.name} (${pageDef.url})`);
    
    for (const viewport of VIEWPORTS) {
      const result = await testPage(page, pageDef, viewport);
      results.push(result);
      
      if (result.error) {
        console.log(`  ❌ ${viewport.name}: ERRO - ${result.error}`);
      } else if (result.issues.length === 0 && !result.hasHorizontalOverflow) {
        console.log(`  ✅ ${viewport.name}: OK`);
      } else {
        console.log(`  ⚠️  ${viewport.name}: ${result.issues.length} problema(s) encontrado(s)`);
        for (const issue of result.issues) {
          console.log(`     - [${issue.category || issue.type}] ${issue.element} ${issue.size || ''}`);
        }
      }
    }
    console.log('');
  }
  
  await browser.close();
  
  // Generate report
  const totalIssues = results.reduce((acc, r) => acc + (r.issues?.length || 0), 0);
  const pagesWithIssues = results.filter(r => r.issues && r.issues.length > 0);
  
  console.log('📊 RESUMO DO TESTE');
  console.log('='.repeat(50));
  console.log(`Total de páginas testadas: ${PAGES.length}`);
  console.log(`Total de viewports por página: ${VIEWPORTS.length}`);
  console.log(`Total de problemas encontrados: ${totalIssues}`);
  console.log(`Páginas com problemas: ${pagesWithIssues.length}`);
  
  if (totalIssues > 0) {
    console.log('\n🔧 PROBLEMAS POR PÁGINA:');
    console.log('-'.repeat(50));
    
    for (const result of pagesWithIssues) {
      console.log(`\n${result.page} (${result.viewport}):`);
      for (const issue of result.issues) {
        console.log(`  - [${issue.category || issue.type}] ${issue.element} ${issue.size || ''}`);
      }
    }
  }
  
  // Save JSON report
  const fs = await import('fs');
  fs.writeFileSync('screenshots/responsiveness-report.json', JSON.stringify(results, null, 2));
  console.log('\n📁 Relatório salvo em screenshots/responsiveness-report.json');
}

main().catch(console.error);
