import https from 'https';

const url = 'https://www.receptaai.com.br/briefing/';
https.get(url, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('=== Deployed Briefing Page Audit ===');
    console.log('Page size:', data.length, 'bytes');
    
    // Check critical elements
    const checks = [
      ['form#form element', '<form id="form"'],
      ['esc function (const esc)', 'const esc'],
      ['S array definition', 'const S = ['],
      ['S.forEach build loop', 'S.forEach'],
      ['panels variable', 'const panels'],
      ['showStep function', 'function showStep'],
      ['firstIncompleteStep call', 'showStep(firstIncompleteStep'],
      ['section.active CSS', 'section.active'],
      ['fieldIn animation', 'fieldIn'],
      ['fieldset wrapper', 'fieldset'],
      ['textarea generation', 'textarea'],
      ['input generation', '<input type='],
      ['renderRail function', 'function renderRail'],
      ['completion screen', 'completion'],
      ['page-transition.js', 'page-transition.js'],
      ['page-transition.css', 'page-transition.css'],
    ];
    
    checks.forEach(([name, needle]) => {
      const found = data.includes(needle);
      console.log(`${found ? '✅' : '❌'} ${name}`);
    });
    
    // Check for the CSS animation that makes fields visible
    const hasFieldInKeyframe = data.includes('@keyframes fieldIn');
    const hasFieldInRule = data.includes('animation: fieldIn');
    console.log(`${hasFieldInKeyframe ? '✅' : '❌'} @keyframes fieldIn`);
    console.log(`${hasFieldInRule ? '✅' : '❌'} animation: fieldIn rule`);
    
    // Check step 1 fields in S array
    const step1Fields = ['clinica', 'whats_resp', 'numero', 'cnpj', 'endereco', 'servicos', 'convenios', 'horario_func'];
    console.log('\n=== Step 1 fields in S array ===');
    step1Fields.forEach(id => {
      const found = data.includes(`"${id}"`) || data.includes(`i: "${id}"`);
      console.log(`${found ? '✅' : '❌'} field: ${id}`);
    });
    
    // Check step 2 fields
    console.log('\n=== Step 2 fields ===');
    console.log(`${data.includes('"aceite"') ? '✅' : '❌'} field: aceite`);
    
    // Check CSS - critical rule
    console.log('\n=== Critical CSS ===');
    console.log(`${data.includes('#form > section {') ? '✅' : '❌'} #form > section rule`);
    console.log(`${data.includes('#form > section.active {') ? '✅' : '❌'} #form > section.active rule`);
    console.log(`${data.includes('display: none') ? '✅' : '❌'} display: none (base state)`);
    console.log(`${data.includes('display: block') ? '✅' : '❌'} display: block (active state)`);
  });
});
